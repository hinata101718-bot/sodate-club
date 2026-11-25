// ふたりで使うための Firebase の設定。
// config が null のあいだは、ログインなしで「このスマホだけ」に記録する使い方になる。
// Firebase コンソールの「ウェブアプリを追加」で表示される firebaseConfig をここに貼る。
// （この値は公開されても問題ない識別子で、データは firestore.rules で守る）
export default {
  config: null,
  emulator: false,
};
