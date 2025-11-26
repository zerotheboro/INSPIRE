import LOGO from "../image/LOGO.png";
import Main from './COLOR_CHANGE.jsx';
import React from "react";

// A simple model class for tips
class TypeOfTips {
  constructor(type, list) {
    this._type = type;
    this._list = list;
  }
  get type() {
    return this._type;
  }
  get list() {
    return this._list;
  }
}

// Module-scope data; export at top-level (not inside a function)
export const list_of_tips = [
  new TypeOfTips("PRE-LEARN", [
    "Prime mind",
    "WATER ur face/body",
    "BREAK is neccesary",
    "Structure your day",
    "small workout",
    "Track progress ",
  ]),
  new TypeOfTips("META-LEARN", [
    "increase peripheral vision",
    "Use length pointer",
    "NO inner voice",
    "varied/spacial Repetition",
    "Memory palace",
    "Do what you crave last",
    "encode the more paths remember",
    "story telling",
  ]),
  new TypeOfTips("NOTE-TAKE", ["Note-taking 4x4", "NO word-for-word"]),
];

const [PRE, META, NOTE] = list_of_tips;

export default function Tips(props) {
  const PRE0 = (
    <section id={PRE.type}>
      <Main />
      {PRE.list.map((the_tip, idx) => (
        <section className="TIP" key={`pre-${idx}`}>
          <div>
            <h1>{the_tip}</h1>
            <div>
              <p>hey this is a text</p>
              <img src={LOGO} alt="logo" />
            </div>
          </div>
        </section>
      ))}
    </section>
  );

  const META0 = (
    <section id={META.type}>
      {META.list.map((the_tip, idx) => (
        <section className="TIP" key={`meta-${idx}`}>
          <div>
            <h1>{the_tip}</h1>
            <div>
              <p>hey this is a text</p>
              <img src={LOGO} alt="logo" />
            </div>
          </div>
        </section>
      ))}
    </section>
  );

  const NOTE0 = (
    <section id={NOTE.type}>
      {NOTE.list.map((the_tip, idx) => (
        <section className="TIP" key={`note-${idx}`}>
          <div>
            <h1>{the_tip}</h1>
            <div>
              <p>hey this is a text</p>
              <img src={LOGO} alt="logo" />
            </div>
          </div>
        </section>
      ))}
    </section>
  );
  
  return (
    <>
      {META0}
      {NOTE0}
      {PRE0}
    </>
  );
}