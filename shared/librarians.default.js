// Bản sao tài khoản thủ thư mặc định, chỉ dùng cho chế độ chạy thử (không có máy chủ).
// Khi chạy máy chủ thật, tài khoản thủ thư được đọc từ config/librarians.json.
export const DEFAULT_LIBRARIANS = [
  { id: 'quynh', username: 'coquynh', password: 'quynh2026', name: 'Cô Quỳnh', post: 0,
    avatar: { gender: 'f', outfit: 'blue', bottom: 'skirt', skin: '#f6d7bf', hair: 'bun', hairColor: '#1b1512', shoes: 'oxford', backpack: false, glasses: true } },
  { id: 'phuc', username: 'anhphuc', password: 'phuc2026', name: 'Anh Phúc', post: 1,
    avatar: { gender: 'm', outfit: 'black', bottom: 'pants', skin: '#eac29f', hair: 'short', hairColor: '#1b1512', shoes: 'oxford', backpack: false, glasses: false } },
];
