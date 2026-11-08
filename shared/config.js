// Cấu hình chung cho server và client. Sửa số ở đây để đổi luật tích điểm.
export const CONFIG = {
  TZ: 'Asia/Ho_Chi_Minh',

  // Điểm
  START_POINTS: 10,          // lần check-in đầu tiên: có sẵn 10 điểm
  CHECKIN_POINTS: 1,         // mỗi ngày check-in tiếp theo
  STUDY_INTERVAL_SEC: 900,   // cứ 15 phút ngồi học / đọc sách...
  STUDY_POINTS: 0.5,         // ...được cộng 0.5 điểm
  STUDY_DAILY_CAP: 4,        // tối đa 4 điểm/ngày từ học & đọc

  // Xác nhận còn ở chỗ (chống treo máy lấy điểm)
  PRESENCE_CHECK_SEC: 1800,  // sau 30 phút hỏi "Bạn còn đang học?"
  PRESENCE_TIMEOUT_SEC: 180, // không trả lời trong 3 phút thì tạm dừng tính điểm

  // Tương tác giữa sinh viên
  GREET_POINTS: 0.1,
  GREET_PAIR_COOLDOWN_SEC: 600, // chào cùng 1 người: 10 phút mới được cộng lại
  GREET_DAILY_CAP: 2,           // tối đa 2 điểm/ngày từ chào hỏi
  GIFT_POINTS: 0.2,
  GIFT_COOLDOWN_SEC: 3600,      // tặng quà tối đa 1 lần / giờ
  GIFT_REQUIRES_ITEM: true,     // phải có giấy/bút trong túi mới tặng được

  // Mượn trả
  BORROW_COST: 1,
  BORROW_MAX: 3,
  BORROW_DAYS: 7,
  RETURN_ONTIME_BONUS: 0.2,

  // Chat
  CHAT_MAX_LEN: 200,
  CHAT_MIN_INTERVAL_MS: 1000,
  CHAT_HISTORY: 60,

  MAX_ONLINE: 400,
};

export const SHOP = [
  { id: 'a4',        name: 'Giấy A4 (xấp 10 tờ)', price: 0.3, icon: '📄', giftable: true },
  { id: 'pen',       name: 'Bút bi',               price: 0.3, icon: '🖊️', giftable: true },
  { id: 'pencil',    name: 'Bút chì 2B',           price: 0.3, icon: '✏️' },
  { id: 'notebook',  name: 'Vở 200 trang',          price: 1,   icon: '📓' },
  { id: 'highlight', name: 'Bút dạ quang',          price: 0.5, icon: '🖍️' },
  { id: 'sticky',    name: 'Giấy note',             price: 0.5, icon: '🗒️' },
  { id: 'ruler',     name: 'Thước kẻ 30cm',         price: 0.3, icon: '📏' },
];
export const SHOP_BY_ID = Object.fromEntries(SHOP.map(i => [i.id, i]));

// Các lựa chọn ngoại hình. Server chỉ chấp nhận giá trị trong danh sách này.
export const AVATAR = {
  gender:  [['m', 'Nam'], ['f', 'Nữ']],
  outfit:  [['dtu', 'Áo thể thao DTU'], ['black', 'Sơ mi đen – cà vạt xám'], ['blue', 'Sơ mi xanh – cà vạt sọc'], ['casual', 'Áo thun tự do']],
  bottom:  [['pants', 'Quần dài'], ['skirt', 'Chân váy']],
  skin:    [['#f6d7bf', 'Sáng'], ['#eac29f', 'Trung bình'], ['#d4a37c', 'Ngăm'], ['#a9745a', 'Nâu']],
  hair:    [['short', 'Ngắn'], ['side', 'Rẽ ngôi'], ['bob', 'Bob ngang vai'], ['long', 'Dài'], ['ponytail', 'Buộc đuôi ngựa'], ['bun', 'Búi cao']],
  hairColor: [['#1b1512', 'Đen'], ['#3b2a20', 'Nâu đen'], ['#6b4128', 'Nâu hạt dẻ'], ['#9a6a3c', 'Nâu sáng'], ['#7b2433', 'Đỏ rượu'], ['#c9b28a', 'Vàng khói']],
  shoes:   [['sneaker', 'Giày thể thao'], ['oxford', 'Giày tây'], ['sandal', 'Dép quai hậu']],
  bagColor: [['#2a3550', 'Xanh than'], ['#8c1d2f', 'Đỏ đô'], ['#3f5a3a', 'Xanh rêu'], ['#d9cfbf', 'Be'], ['#1d1d1f', 'Đen']],
};

export const DEFAULT_AVATAR = {
  gender: 'f', outfit: 'dtu', bottom: 'skirt', skin: '#f6d7bf', hair: 'long',
  hairColor: '#1b1512', shoes: 'sneaker', backpack: true, bagColor: '#2a3550', glasses: false,
};

export function sanitizeAvatar(a) {
  const out = { ...DEFAULT_AVATAR };
  if (!a || typeof a !== 'object') return out;
  for (const key of Object.keys(AVATAR)) {
    if (AVATAR[key].some(([v]) => v === a[key])) out[key] = a[key];
  }
  out.backpack = !!a.backpack;
  out.glasses = !!a.glasses;
  if (out.gender === 'm') out.bottom = 'pants';
  return out;
}
