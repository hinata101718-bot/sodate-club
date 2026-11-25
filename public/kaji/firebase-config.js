// ふたりで使うための Firebase の設定（プロジェクト kaji-points）。
// config を null にすると、ログインなしで「このスマホだけ」に記録する使い方に戻る。
// （この値は公開されても問題ない識別子で、データは kaji-firebase/firestore.rules で守る）
export default {
  config: {
    apiKey: "AIzaSyCpgzSHgj5Smqhw3J7EPIJtQDxDo-nppR0",
    authDomain: "kaji-points-e9d8f.firebaseapp.com",
    projectId: "kaji-points-e9d8f",
    storageBucket: "kaji-points-e9d8f.firebasestorage.app",
    messagingSenderId: "881787507090",
    appId: "1:881787507090:web:8ca5d595df026a9e9bf14b",
  },
  emulator: false,
};
