
function givedecison(){
    let list_of_choices = ["YES",'NO',"DON'T WAIT", "DO IT", "think carefully", "maybe", "absolutely", "never", "definitely", "of course", "without a doubt", "ask again later", "better not tell you now", "concentrate and ask again", "my reply is no", "my sources say no", "outlook not so good", "very doubtful"]
    let list_of_colors = ["aqua","black","blue","fuchsia","gray","green","lime","maroon","navy","olive","purple","red","silver","teal","white","yellow"]
    let  selector_num = Math.floor(Math.random()*list_of_choices.length)
    let  selector_color = Math.floor(Math.random()*list_of_colors.length)
    let current_value = document.getElementById("PROMPT").innerText
    if (list_of_choices[selector_num] !== current_value) {
        document.getElementById("PROMPT").innerHTML = `${list_of_choices[selector_num]}`
        document.getElementById("PROMPT").color = `${list_of_colors[selector_color]}`
    }
    if (list_of_choices[selector_num] === current_value) {
        let indexremove = list_of_choices.indexOf(current_value)
        list_of_choices.splice(indexremove, 1)
        let  selector_num2 = Math.floor(Math.random()*list_of_choices.length)
        document.getElementById("PROMPT").innerHTML = `${list_of_choices[selector_num2]}`

    }
};
document.getElementById("generatePROMPTbutton").addEventListener('click', givedecison);

