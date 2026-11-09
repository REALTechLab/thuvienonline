// Dữ liệu sách ban đầu. Khi máy chủ chạy lần đầu, dữ liệu này được chép vào data/db.json;
// sau đó thủ thư quản lý sách trong game (cửa sổ "Quản lý sách"), không cần sửa file này nữa.
import { LAYOUT } from './layout.js';

const CATEGORY_NAMES = [
  'Công nghệ thông tin', 'Trí tuệ nhân tạo & Dữ liệu', 'Điện – Điện tử', 'Xây dựng & Kiến trúc',
  'Kinh tế học', 'Quản trị kinh doanh', 'Kế toán – Tài chính', 'Du lịch – Khách sạn',
  'Y – Dược – Điều dưỡng', 'Ngoại ngữ', 'Luật học', 'Khoa học xã hội & Nhân văn',
  'Toán & Khoa học tự nhiên', 'Văn học & Kỹ năng sống', 'Tạp chí & Báo', 'Sách mới về',
];

const TITLES = [
  ['Nhập môn lập trình với C++', 'Cấu trúc dữ liệu và giải thuật', 'Cơ sở dữ liệu', 'Mạng máy tính', 'Hệ điều hành', 'Lập trình Web với JavaScript', 'Công nghệ phần mềm', 'An toàn thông tin'],
  ['Nhập môn Trí tuệ nhân tạo', 'Học máy cơ bản', 'Khai phá dữ liệu', 'Xử lý ngôn ngữ tự nhiên', 'Thị giác máy tính', 'Python cho khoa học dữ liệu', 'Thống kê ứng dụng', 'Dữ liệu lớn'],
  ['Mạch điện', 'Điện tử tương tự', 'Kỹ thuật số', 'Vi điều khiển và IoT', 'Xử lý tín hiệu số', 'Hệ thống nhúng', 'Điện tử công suất', 'Đo lường điện'],
  ['Sức bền vật liệu', 'Cơ học kết cấu', 'Kết cấu bê tông cốt thép', 'Vẽ kỹ thuật xây dựng', 'Nguyên lý thiết kế kiến trúc', 'Quy hoạch đô thị', 'Vật liệu xây dựng', 'Thi công nhà cao tầng'],
  ['Kinh tế vi mô', 'Kinh tế vĩ mô', 'Kinh tế lượng', 'Kinh tế quốc tế', 'Kinh tế phát triển', 'Lịch sử các học thuyết kinh tế', 'Kinh tế học hành vi', 'Kinh tế môi trường'],
  ['Quản trị học', 'Marketing căn bản', 'Quản trị nhân lực', 'Quản trị chiến lược', 'Hành vi người tiêu dùng', 'Khởi nghiệp và đổi mới', 'Quản trị chuỗi cung ứng', 'Thương mại điện tử'],
  ['Nguyên lý kế toán', 'Kế toán tài chính', 'Tài chính doanh nghiệp', 'Kiểm toán căn bản', 'Thuế', 'Thị trường chứng khoán', 'Ngân hàng thương mại', 'Phân tích báo cáo tài chính'],
  ['Tổng quan du lịch', 'Nghiệp vụ lễ tân khách sạn', 'Quản trị nhà hàng', 'Hướng dẫn du lịch', 'Địa lý du lịch Việt Nam', 'Văn hóa ẩm thực', 'Tổ chức sự kiện', 'Du lịch bền vững'],
  ['Giải phẫu học', 'Sinh lý học', 'Hóa sinh', 'Dược lý học', 'Điều dưỡng cơ bản', 'Vi sinh vật y học', 'Dinh dưỡng và vệ sinh an toàn thực phẩm', 'Sức khỏe cộng đồng'],
  ['Ngữ pháp tiếng Anh thực hành', 'Luyện nghe IELTS', 'Viết học thuật', 'Tiếng Anh thương mại', 'Tiếng Hàn sơ cấp', 'Tiếng Nhật sơ cấp', 'Biên dịch Anh – Việt', 'Tiếng Trung giao tiếp'],
  ['Lý luận nhà nước và pháp luật', 'Luật Hiến pháp', 'Luật Dân sự', 'Luật Hình sự', 'Luật Thương mại', 'Luật Lao động', 'Luật Sở hữu trí tuệ', 'Pháp luật đại cương'],
  ['Triết học Mác – Lênin', 'Tư tưởng Hồ Chí Minh', 'Lịch sử Việt Nam', 'Tâm lý học đại cương', 'Xã hội học', 'Cơ sở văn hóa Việt Nam', 'Báo chí truyền thông', 'Quan hệ quốc tế'],
  ['Giải tích 1', 'Giải tích 2', 'Đại số tuyến tính', 'Xác suất thống kê', 'Toán rời rạc', 'Vật lý đại cương', 'Hóa học đại cương', 'Sinh học đại cương'],
  ['Tuyển tập truyện ngắn Việt Nam', 'Thơ Việt Nam hiện đại', 'Kỹ năng thuyết trình', 'Kỹ năng làm việc nhóm', 'Quản lý thời gian', 'Tư duy phản biện', 'Văn học thế giới', 'Kỹ năng viết CV'],
  ['Tạp chí Khoa học & Công nghệ', 'Tạp chí Kinh tế & Dự báo', 'Tạp chí Kiến trúc', 'Tạp chí Y học', 'Báo Sinh viên', 'Tạp chí Du lịch', 'Tạp chí Giáo dục', 'Bản tin Thư viện'],
  ['Sách mới: Lập trình AI thực chiến', 'Sách mới: Marketing số', 'Sách mới: Kiến trúc xanh', 'Sách mới: Tài chính cá nhân', 'Sách mới: Tiếng Anh giao tiếp', 'Sách mới: Kỹ năng học đại học', 'Sách mới: Lịch sử Đà Nẵng', 'Sách mới: Khoa học quanh ta'],
];

const PREFIX = ['IT', 'AI', 'EE', 'CE', 'EC', 'BA', 'AC', 'TO', 'MD', 'FL', 'LW', 'SS', 'MS', 'LT', 'MG', 'NW'];

export function seedCatalog() {
  const categories = CATEGORY_NAMES.map((name, i) => ({ id: 'C' + String(i + 1).padStart(2, '0'), name }));
  const books = [];
  TITLES.forEach((list, c) => {
    const shelf = LAYOUT.shelves.find(s => s.seed === c)?.id || LAYOUT.shelves[0].id;
    list.forEach((title, i) => books.push({
      id: `${PREFIX[c]}-${String(i + 1).padStart(2, '0')}`, title, author: '',
      category: categories[c].id, shelf, copies: c >= 14 ? 1 : 2 + (i % 3), borrowable: c !== 14,
    }));
  });
  const shelfLabels = {};
  for (const s of LAYOUT.shelves) shelfLabels[s.id] = CATEGORY_NAMES[s.seed] || '';
  return { categories, books, shelfLabels };
}

// Kiểm tra & chuẩn hóa một cuốn sách (dùng ở máy chủ khi thủ thư thêm/sửa/nhập)
export const SHELF_IDS = LAYOUT.shelves.map(s => s.id);
export function normalizeBook(b, catalog) {
  const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const out = {
    id: str(b.id, 16).toUpperCase().replace(/\s/g, ''),
    title: str(b.title, 120), author: str(b.author, 80),
    category: str(b.category, 40), shelf: str(b.shelf, 8).toUpperCase(),
    copies: Math.floor(+b.copies), borrowable: b.borrowable === true || b.borrowable === 'true' || b.borrowable === 1 || b.borrowable === '1' || /^(có|co|yes|x)$/i.test(String(b.borrowable)),
  };
  // cho phép nhập phân loại bằng tên thay vì mã
  if (!catalog.categories.some(c => c.id === out.category)) {
    const byName = catalog.categories.find(c => c.name.toLowerCase() === out.category.toLowerCase());
    if (byName) out.category = byName.id;
  }
  if (!/^[A-Z0-9-]{2,16}$/.test(out.id)) return { error: 'Mã sách gồm 2–16 ký tự chữ, số hoặc dấu gạch ngang.' };
  if (out.title.length < 2) return { error: 'Tên sách quá ngắn.' };
  if (!catalog.categories.some(c => c.id === out.category)) return { error: `Không có phân loại "${out.category}".` };
  if (!SHELF_IDS.includes(out.shelf)) return { error: `Không có kệ "${out.shelf}". Kệ hợp lệ: ${SHELF_IDS[0]}–${SHELF_IDS[SHELF_IDS.length - 1]}.` };
  if (!Number.isFinite(out.copies) || out.copies < 0 || out.copies > 999) return { error: 'Số lượng phải từ 0 đến 999.' };
  return { book: out };
}
