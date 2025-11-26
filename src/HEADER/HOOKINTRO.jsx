import { useState } from "react";
import {list_of_tips} from "../MIDSECTION/section_of_each_tips";


function Initial_Choice(){

    const [show, setShow] = useState(false);

    return(
    <section id="options_of_tips_to_choose">
        {list_of_tips.map((object) =>
        <button onClick={() => { 
            setShow(!prevShow)
            show ? document.getElementById(object.type).style.display = "" : document.getElementById(object.type).style.display = "none";
            }}>
            {object._type}
        </button> )}
    </section>
    )
    
}
export default Initial_Choice;