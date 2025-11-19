import LOGO from "./image/LOGO.png";


function Tips(props){

const list_of_tips = [
  "increase peripheral vision",
  "Use length pointer",
  "Prime mind",
  "Stay hydrated/ wash your face",
  "Shut down your vocal voice",
  "Note-taking 4x4",
  "BREAK is neccesary",
  "Structure your day",
  "NO word-for-word",
  "small workout",
  "varied/spacial Repetition",
  "Memory palace",
  "Latch it on vivid emotion",
  "Do what you crave last",
  "The more ways you encode, the more paths you remember",
  "story telling",
  "Track it (gives you where progress is)",
];

//ARRANGE DIFFERENT TIPS WITH SIMMILARRITY USING OBJECT!!!

let tips = list_of_tips.map(( the_tip, index)=> 
<>
    <section className="TIP " >
        <div>
            <h1>{the_tip}</h1>
            <div>
                <p>hey this is a text</p> <img src={LOGO}></img>
            </div>
        </div>
    </section> 
</>)

return (tips);

}
export default Tips;