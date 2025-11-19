
import LOGO from "./image/LOGO.png";

function NAV(){
    const img_source = LOGO;
    return(
        <header>
            <section id="NAV">
                <span class="logo"><img src={img_source}/>RAPID CHOICE</span>
                <span><a href="">BENEFITs</a></span>
                <span><a href="">STEPs</a></span>
                <span><a href="#contact" target="_self">CONTACTs</a></span>
            </section>
        </header>
    );
}

export default NAV;