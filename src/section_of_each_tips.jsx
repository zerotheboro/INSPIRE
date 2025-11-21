import LOGO from "./image/LOGO.png";


function Tips(props){


class type_of_tips{
    constructor(type, list){
        this._type = type;
        this._list = list;

    }

    get type(){
        return this._type;
    }

    get list(){
        return this._list;
    }
}

const list_of_tips = [
    new type_of_tips("JUMPSTART", ["Prime mind","Stay hydrated/ wash your face",  "BREAK is neccesary",  "Structure your day",  "small workout", "Track progress ",]),
    new type_of_tips("META- LEARNING", ["increase peripheral vision","Use length pointer","NO inner voice","varied/spacial Repetition","Memory palace", "Do what you crave last", "encode the more paths remember", "story telling",]),
    new type_of_tips("NOTE-TAKING", ["Note-taking 4x4", "NO word-for-word",])
]

 /* "increase peripheral vision",
  "Use length pointer",
  "Shut down your vocal voice",
  "Note-taking 4x4",
  "NO word-for-word",
  "varied/spacial Repetition",
  "Memory palace",
  "Latch it on vivid emotion",
  "Do what you crave last",
  "The more ways you encode, the more paths you remember",
  "story telling",
  "Track it (gives you where progress is)",
];*/

//ARRANGE DIFFERENT TIPS WITH SIMMILARRITY USING OBJECT!!!

let tips = list_of_tips.map(( the_tips, index)=> 
    the_tips.list.map((the_tip) =>
<>
    <section className="TIP " >
        <div>
            <h1>{the_tip}</h1>
            <div>
                <p>hey this is a text</p> 
                <img src={LOGO}></img>
            </div>
            
        </div>
    </section> 
</>));

return (tips);

}
export default Tips;