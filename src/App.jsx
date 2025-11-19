import Tips from './section_of_each_tips.jsx';
import NAV from './header.jsx';
import Main from './main_content.jsx';
import Footer from './footer.jsx';
import Benifit from './BENEFIT.jsx';
import { useState } from 'react';


function App() {
  return (
    <>
      <NAV/>
      <Benifit/>
      <Tips/>
      <Main/>
      <Footer/>
    </>
      
  );
}

export default App
