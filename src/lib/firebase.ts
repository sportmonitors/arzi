import {initializeApp, getApps, getApp} from 'firebase/app';
import {getAuth, GoogleAuthProvider} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAk3wTvoYAIQs2aQv0H_QvJMr6Y4wnRrBk',
  authDomain: 'arz-calculator.firebaseapp.com',
  projectId: 'arz-calculator',
  storageBucket: 'arz-calculator.firebasestorage.app',
  messagingSenderId: '485144496784',
  appId: '1:485144496784:web:df439b0d74681083a4e615',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export {app, auth, googleProvider};
