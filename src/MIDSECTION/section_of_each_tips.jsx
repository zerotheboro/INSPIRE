import LOGO from "../image/LOGO.png";
import Main from './COLOR_CHANGE.jsx';
import React, {useState} from "react";
import {the_animation_obj} from "./../HEADER/ANIMATION.jsx";
import gsap from "gsap";

/*THE 2 CLASS */
class TypeOfTips {
  constructor(type, list, additional_material = null) {
    this._type = type;
    this._list = list;
    this._additional_material = additional_material
  }
  get type() {
    return this._type;
  }
  get list() {
    return this._list;
  }
  get additional_material(){
    return this._additional_material;
  };
}


class DetailOfTips{
  constructor(header = "hey this is a header", paragraph = "hey this is a text", img = LOGO){
    this._header = header;
    this._paragraph = paragraph;
    this._img = img;
  }
  get header(){
    return this._header;
  }
  get paragraph(){
    return this._paragraph;
  }
  get img(){
    return this._img;
  }
}



// Module-scope data; export at top-level (not inside a function)
export const list_of_tips = [
  new TypeOfTips("PRE-LEARN", [
    new DetailOfTips("Prime mind"),
    new DetailOfTips("WATER ur face/body"),
    new DetailOfTips("BREAK is necessary"),
    new DetailOfTips("Structure your day"),
    new DetailOfTips("small workout"),
    new DetailOfTips("Track progress")
  ], <Main/>),
  new TypeOfTips("META-LEARN", [
     new DetailOfTips("increase peripheral vision"),
    new DetailOfTips("Use length pointer"),
    new DetailOfTips("NO inner voice"),
    new DetailOfTips("varied/spacial Repetition"),
    new DetailOfTips("Memory palace"),
    new DetailOfTips("Do what you crave last"),
    new DetailOfTips("encode the more paths remember"),
    new DetailOfTips("story telling")
  ]),
  new TypeOfTips("NOTE-TAKE", [
    new DetailOfTips("Note-taking 4x4"),
    new DetailOfTips("NO word-for-word"),
  ]),
];



/*JUST JSX for render */
export default function Tips(props) {

  const [show, setShow] = useState({
  });
  


  const list_of_tips_JSX = list_of_tips.map((each_section) => 
    <section id={each_section.type} key={each_section.type} style={{display : show[each_section.type] ? "block" : "none"}}>
      {each_section.additional_material}

      {each_section.list.map((the_tip, idx) => (
        <section className="TIP" key={`${each_section.type}-${idx}`}>
          <div>
            <h1>{the_tip.header}</h1>
            <div>
              <p>{the_tip.paragraph}</p>
              <img src={the_tip.img} alt="logo" />
            </div>
          </div>
        </section>
      ))}

    </section>
  );

 /*function handleClick(section){
    setShow(prevShow => ({
        ...prevShow,
        [section]: !prevShow[section]
    }))
}*/

function handleClickfor1(section){
  setShow(prevShow => {

    const NewState = {};
    list_of_tips.forEach((object) => {
      NewState[object.type] = (object.type === section)? !prevShow[section] : false;
    });

    return NewState
  })

}

  return (
    <>
    <section id="options_of_tips_to_choose">
        {list_of_tips.map((section) =>
        <button onClick={() => handleClickfor1(section._type)}>
            {section._type}
        </button> )}
    </section>
      {list_of_tips_JSX}
    </>
  );

}