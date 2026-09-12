// Import the functions you need from the SDKs you need
import { getFunctions } from "firebase/functions";
import { getFirestore } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBftgHofJuuCZmdpCPYukg7CpsrDX8jI58",
  authDomain: "inspire-life-f7cc8.firebaseapp.com",
  projectId: "inspire-life-f7cc8",
  storageBucket: "inspire-life-f7cc8.firebasestorage.app",
  messagingSenderId: "647570114197",
  appId: "1:647570114197:web:a31920001180ade8c47d9c",
  measurementId: "G-883R2SRCRH"
};

const app = initializeApp(firebaseConfig);

export const functions = getFunctions(app, "asia-southeast1");

export const db = getFirestore(app);

export const analytics =
  typeof window !== "undefined"
    ? getAnalytics(app)
    : undefined;