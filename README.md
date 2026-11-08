# Thư viện DTU Online

Game thư viện 3D chạy trên trình duyệt, dựng lại không gian Thư viện Đại học Duy Tân theo mặt bằng 26 m × 30 m. Sinh viên khai báo thông tin, chọn ngoại hình, chọn ghế để ngồi học hoặc đọc sách, mượn trả sách với thủ thư, mua đồ dùng học tập và tích điểm khi tương tác với nhau.

- Client: three.js 0.170 (tải từ CDN jsDelivr), không cần build.
- Server: Node.js ≥ 18, **không cần `npm install`** (WebSocket tự cài đặt, dữ liệu lưu file JSON).

## Chạy thử trên máy

```bash
node server.js          # mở http://localhost:3000
```

Thêm `?demo` vào địa chỉ (`http://localhost:3000/?demo`) để chạy chế độ thử: không cần máy chủ, luật chơi chạy trong trình duyệt, có 14 sinh viên ảo đi lại, ngồi học và trò chuyện. Ở chế độ thử, 1 phút học = 1 lượt tích điểm để thấy kết quả nhanh.

## Triển khai lên hosting Linux

### Cách 1 — VPS (Ubuntu/Debian/CentOS)

```bash
# 1. Cài Node.js 20 LTS (ví dụ Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# 2. Chép thư mục dự án lên, ví dụ /var/www/thuvien
cd /var/www/thuvien

# 3. Chạy nền bằng pm2 (tự khởi động lại khi lỗi/khởi động máy)
sudo npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup
```

Sau đó cấu hình Nginx làm reverse proxy theo `deploy/nginx.conf.example` (đã có phần nâng cấp WebSocket ở `/ws`) và cài SSL bằng `certbot --nginx`. Nếu không dùng pm2 có thể dùng `deploy/thuvien.service` (systemd).

### Cách 2 — Shared hosting có mục "Setup Node.js App" (cPanel / DirectAdmin)

1. Tải toàn bộ thư mục lên (ví dụ `~/thuvien`).
2. Trong cPanel → **Setup Node.js App** → Create Application: Node.js 18 trở lên, Application root `thuvien`, Application startup file `server.js`, Application URL tùy chọn.
3. Bấm **Start**. Không cần chạy `npm install`.
4. Nhiều nhà cung cấp chạy Node qua Passenger, vẫn hỗ trợ WebSocket. Nếu vào game thấy báo "Chế độ chạy thử" thì nghĩa là WebSocket bị chặn — liên hệ nhà cung cấp để bật.

### Cách 3 — Hosting chỉ có PHP (không có Node.js)

Không chạy được máy chủ nhiều người chơi. Vẫn có thể đưa lên bản chạy thử một người: chép thư mục `shared/` vào trong `public/`, rồi tải nội dung `public/` lên `public_html`. Trang sẽ tự chuyển sang chế độ chạy thử.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng HTTP/WebSocket |
| `HOST` | `0.0.0.0` | Địa chỉ lắng nghe (đặt `127.0.0.1` khi đứng sau Nginx) |
| `DATA_DIR` | `./data` | Thư mục lưu `db.json` |

Kiểm tra máy chủ: `GET /api/health` trả về số người online, số ghế đang dùng, số tài khoản.

## Dữ liệu

Toàn bộ tài khoản, điểm, sách đang mượn nằm trong `data/db.json` (ghi lại sau mỗi thay đổi ~2 giây, ghi an toàn qua file tạm). Sao lưu file này định kỳ. Mã PIN được băm bằng scrypt, không lưu dạng rõ.

## Tùy chỉnh

| Muốn đổi | Sửa file |
|---|---|
| Luật tích điểm, giá đồ dùng, giới hạn mượn sách, lựa chọn trang phục | `shared/config.js` |
| Danh mục sách trên từng kệ | `shared/catalog.js` |
| Mặt bằng: vị trí kệ, bàn, ghế, phòng họp, quầy thủ thư | `shared/layout.js` |
| Màu sắc, vật liệu, ánh sáng, cảnh ngoài cửa kính | `public/js/world.js` |
| Hình dáng nhân vật, đồng phục | `public/js/avatar.js` |
| Giao diện, bảng chức năng | `public/js/main.js`, `public/css/style.css` |

Luật mặc định:

| Hoạt động | Điểm |
|---|---|
| Check-in lần đầu | 10 |
| Check-in mỗi ngày (tự động khi vào thư viện) | +1 |
| Ngồi học / đọc sách mỗi 15 phút (tối đa 4 điểm/ngày) | +0.5 |
| Chào hỏi (mỗi bạn 1 lần/10 phút, tối đa 2 điểm/ngày) | +0.1 |
| Tặng giấy A4 hoặc bút (tối đa 1 lần/giờ, cần có đồ trong túi) | +0.2 |
| Trả sách đúng hạn | +0.2 |
| Mượn sách (tối đa 3 cuốn, 7 ngày) | −1 |

Ngồi học liên tục 30 phút, hệ thống hỏi "Bạn vẫn đang học chứ?". Không xác nhận trong 3 phút thì tạm dừng tính điểm.

## Cấu trúc

```
server.js            máy chủ HTTP + WebSocket + lưu dữ liệu
shared/              dùng chung server & trình duyệt
  config.js          luật chơi, cửa hàng, lựa chọn ngoại hình
  layout.js          mặt bằng thư viện (106 chỗ ngồi, 16 kệ)
  catalog.js         danh mục sách
  core.js            xử lý toàn bộ luật chơi
  nav.js             tìm đường A*
public/
  index.html
  css/style.css
  js/main.js         giao diện, điều khiển, camera
  js/world.js        dựng không gian 3D
  js/avatar.js       nhân vật
  js/net.js          kết nối WebSocket
  js/demo.js         chế độ chạy thử + sinh viên ảo
deploy/              cấu hình pm2, systemd, Nginx
```

## Tự host three.js (không phụ thuộc CDN)

Tải `three.module.js` và thư mục `examples/jsm` của three@0.170.0 vào `public/vendor/three/`, rồi sửa `importmap` trong `public/index.html`:

```json
{ "imports": { "three": "./vendor/three/three.module.js", "three/addons/": "./vendor/three/examples/jsm/" } }
```

## Hướng nâng cấp

- Đăng nhập bằng tài khoản trường (SSO) thay cho MSSV + PIN.
- Chuyển `db.json` sang SQLite/MySQL khi số tài khoản lớn.
- Hiển thị nội dung sách (PDF/ebook) khi đọc tại kệ.
- Thay nhân vật và nội thất bằng mô hình glTF.
- Trang quản trị cho thủ thư: thêm sách, xem thống kê, khóa tài khoản.
- Lọc từ ngữ trong chat, báo cáo vi phạm.
