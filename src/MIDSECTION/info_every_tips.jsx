import LOGO from "../assets/LOGO.png";
import Main from './COLOR_CHANGE.jsx';

const images = import.meta.glob("../assets/*.{png,jpg,jpeg,webp,gif,svg,mp4}", { eager: true });
/*return an object of file */
const imageFiles = Object.entries(images).map(([path, module]) => ({
  path,
  url: module.default
}));
/*convert it back to another form of object */

function image_importor(name, type = "image") {
  const found = imageFiles.find(file => file.path.includes(name));
  if (!found) {
    console.warn(`Image not found: ${name}`);
    return null;
  }
  else{
  return {src : found.url,
          format : type
  }
}
}

/*async function image_selector(url_of_image, format='.svg'){
  const imported_img = await import(`../image/${url_of_image}${format}`);

  console.log(`../image/${url_of_image}${format}`)

  return imported_img.default;
}*/
  

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

/*change img into asset */
class DetailOfTips{
  constructor(header = "header", paragraph = "p",  VNheader = "VN 1#", VNparagraph = "VN para !!!", asset = { src:LOGO, type: "image"}, side="right"){
    this._header = header;
    this._paragraph = paragraph;
    this._asset = asset;
    this._side = side;
    this._VNheader = VNheader;
    this._VNparagraph =VNparagraph;
  }
  get header(){
    return this._header;
  }
  get paragraph(){
    return this._paragraph;
  }
  get asset(){
    return this._asset;
  }
  get side(){
    return this._side;
  }
  get VNheader(){
    return this._VNheader;
  }
  get VNparagraph(){
    return this._VNparagraph;
  }
}



// Module-scope data; export at top-level (not inside a function)
export const list_of_tips = [
  new TypeOfTips(
    "PRE-LEARN",
    [
    ],
    <Main />
  ),

  new TypeOfTips(
    "META-LEARN",
    [
    ]
  ),

  new TypeOfTips(
    "NOTE-TAKE",
    [
    ]
  ),
];

// Named export above; no default export to avoid import ambiguity