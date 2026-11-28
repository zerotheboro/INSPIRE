/** One isolated process policy shared with the real loopback harness. */
import {readFileSync, realpathSync} from "node:fs";
import {join, resolve} from "node:path";

export const privateToolPolicy = Object.freeze({
  shell_tool: false, view_image: false, remote_plugin: false,
  skill_mcp_dependency_install: false, goals: false, multi_agent: false,
  multi_agent_v2: false, plugins: false, skill_search: false,
  skip_host_skill_discovery: true, omit_skill_descriptions: true,
});

/** Exact config; sign-in is managed by app-server without token copying.
 * @return {string} File bytes expected before opening a real profile.
 */
export function privateChatgptConfig() {
  return "model = \"gpt-6-luna\"\nmodel_provider = \"openai\"\n" +
    "forced_login_method = \"chatgpt\"\n" +
    "cli_auth_credentials_store = \"file\"\n" +
    "approval_policy = \"never\"\nsandbox_mode = \"read-only\"\n" +
    "web_search = \"disabled\"\n[features]\n" +
    Object.entries(privateToolPolicy).map(([k, v]) => `${k} = ${v}`)
      .join("\n") + "\n[skills]\ninclude_instructions = false\n" +
    "[skills.bundled]\nenabled = false\n" +
    "[plugins._default]\nenabled = false\n";
}

/** Deny profile/config inheritance; credentials remain inside managed login.
 * @param {string} profile Non-synced operator-created app-server profile.
 * @return {object} Minimal process environment with no inherited API keys.
 */
export function isolatedChatgptEnvironment(profile: string) {
  const root = resolve(profile);
  if (/onedrive|dropbox|google drive|^\\\\/i.test(root) ||
      root.toLowerCase().startsWith(resolve(".").toLowerCase()) ||
      realpathSync(root).toLowerCase() !== root.toLowerCase() ||
      readFileSync(join(root, "config.toml"), "utf8") !==
        privateChatgptConfig()) throw Error("CHATGPT_PROFILE_HOLD");
  return {SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR,
    PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP,
    USERPROFILE: root, HOME: root, CODEX_HOME: root, LOCALAPPDATA: root};
}
