// Danh mục sách theo từng kệ. Có thể thay bằng dữ liệu thật của thư viện sau này.
import { CATEGORIES } from './layout.js';

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

export const BOOKS = [];
TITLES.forEach((list, c) => {
  list.forEach((title, i) => {
    BOOKS.push({
      id: `${PREFIX[c]}-${String(i + 1).padStart(2, '0')}`,
      title, category: c, categoryName: CATEGORIES[c],
      copies: c >= 14 ? 1 : 2 + (i % 3),
      borrowable: c !== 14, // tạp chí chỉ đọc tại chỗ
    });
  });
});
export const BOOK_BY_ID = Object.fromEntries(BOOKS.map(b => [b.id, b]));
export const booksOfCategory = c => BOOKS.filter(b => b.category === c);
