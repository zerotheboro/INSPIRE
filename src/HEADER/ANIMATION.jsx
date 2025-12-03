import gsap from "gsap";

const the_animation_obj = {
    the_tip_anime: 
    (animated_stuff) => {gsap.fromTo(
        animated_stuff, 
        {opacity: 0, y: 100},
        {opacity: 1, y: 0, duration: 4, backgroundColor: "blue" 
        })},
    the_section_anime : null,
}
export {the_animation_obj};
