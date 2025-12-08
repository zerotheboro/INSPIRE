import facebook from './image/facebook.svg';
import youtube from './image/youtube.svg';


const list_of_contact = [
    {
        image : facebook,
        scr: "https://www.youtube.com/@gunnychannel204"

    },

    {
        image : youtube,
        scr: "https://www.youtube.com/@gunnychannel204"
    },
    
];
let divs_of_contacts = list_of_contact.map((source) => <div><a href={source.scr} target='_blank'><img src={source.image}/></a></div>)




function Footer(){
    return(
        <footer id="FOOTER">
            <div id="contact">
                {divs_of_contacts}
            </div>
            <p>phone number: 0909528511</p>
            <p>email:<a href="mailto:2002070343@royal.edu.vn">2002070343@royal.edu.vn</a></p> 
        </footer>
    )
}

export default Footer

