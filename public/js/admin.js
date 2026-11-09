// Chức năng dành cho tài khoản thủ thư: duyệt yêu cầu, thu hồi sách, quản lý sách / phân loại / kệ.
import { LAYOUT } from '../shared/layout.js';

const CSV_COLS = [['id', 'Mã sách'], ['title', 'Tên sách'], ['author', 'Tác giả'], ['category', 'Phân loại'], ['shelf', 'Kệ'], ['copies', 'Số lượng'], ['borrowable', 'Cho mượn về']];
const HEADER_MAP = { masach: 'id', ma: 'id', id: 'id', code: 'id', tensach: 'title', ten: 'title', title: 'title', tacgia: 'author', author: 'author',
  phanloai: 'category', theloai: 'category', category: 'category', maphanloai: 'category', ke: 'shelf', make: 'shelf', shelf: 'shelf', vitri: 'shelf',
  soluong: 'copies', sl: 'copies', copies: 'copies', chomuonve: 'borrowable', chomuon: 'borrowable', borrowable: 'borrowable' };
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [';', '\t', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(c => c.trim()));
  if (!clean.length) return { rows: [], error: 'File trống.' };
  const keys = clean[0].map(h => HEADER_MAP[norm(h)] || null);
  if (!keys.includes('id') || !keys.includes('title')) return { rows: [], error: 'Dòng đầu phải là tiêu đề cột, có ít nhất "Mã sách" và "Tên sách".' };
  return { rows: clean.slice(1).map(r => { const o = {}; keys.forEach((k, i) => { if (k) o[k] = (r[i] ?? '').trim(); }); return o; }) };
}
const csvCell = (v) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function createAdmin(ctx) {
  const { S, $, esc, toast, modal, openPanel, renderPanel, bookById, catName, booksOnShelf, shelfName, roleLabel, ddmm, openDm } = ctx;
  const send = (m) => ctx.net().send(m);
  const ago = (ts) => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? `${s} giây trước` : `${Math.floor(s / 60)} phút trước`; };
  const shelfOpts = (sel) => LAYOUT.shelves.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${s.id} · ${esc(shelfName(s.id) || 'kệ trống')}</option>`).join('');
  const catOpts = (sel, all) => (all ? '<option value="all">Tất cả phân loại</option>' : '') + S.catalog.categories.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  let lastBooksFilter = {};
  let importState = null, ioText = '';

  // ---------- Yêu cầu từ bạn đọc & sách đang cho mượn ----------
  function openRequests(tab) {
    send({ t: 'lib_loans' });
    openPanel({
      kind: 'req', eyebrow: 'Thủ thư · chế độ trực tiếp', title: 'Yêu cầu của bạn đọc',
      tabs: [['req', 'Chờ duyệt'], ['loans', 'Sách đang cho mượn']], q: '',
      render(body, t) {
        if (t === 'req') {
          const list = S.reqs;
          body.innerHTML = `<div class="note">Bạn đọc gửi yêu cầu mượn, trả sách và mua đồ dùng tới bạn. Duyệt hoặc từ chối (có thể ghi lý do, lý do sẽ được nhắn riêng cho bạn đọc). Yêu cầu chờ quá 3 phút sẽ được hệ thống tự xử lý.</div>`
            + (list.length ? `<div class="list">${list.map(r => `
              <div class="req">
                <div class="req-top"><b>${esc(r.name)}</b><span class="s">${roleLabel(r.role)} · ${esc(r.username)} · ${r.points.toLocaleString('vi-VN')} điểm · ${ago(r.ts)}</span></div>
                <div class="req-what"><span class="tag ${r.type}">${r.type === 'borrow' ? 'Mượn' : r.type === 'return' ? 'Trả' : 'Mua'}</span>${r.type === 'buy' ? `${r.qty} × ${esc(r.itemName)}` : `<span class="code">${esc(r.book)}</span> ${esc(r.title)}`}</div>
                ${r.problem ? `<div class="req-warn">⚠ ${esc(r.problem)}</div>` : ''}
                <div class="req-btns"><button class="btn small primary" data-ok="${r.id}" ${r.problem ? 'disabled' : ''}>Duyệt</button><button class="btn small" data-no="${r.id}">Từ chối…</button><button class="btn small ghost" data-dm="${r.uid}">💬 Nhắn</button></div>
              </div>`).join('')}</div>` : '<div class="empty">Chưa có yêu cầu nào. Bạn đọc tới quầy và chọn bạn sẽ gửi yêu cầu tới đây.</div>');
          body.querySelectorAll('[data-ok]').forEach(b => (b.onclick = () => { b.disabled = true; send({ t: 'lib_req', id: b.dataset.ok, ok: true }); }));
          body.querySelectorAll('[data-no]').forEach(b => (b.onclick = () => decline(S.reqs.find(r => r.id === b.dataset.no))));
          body.querySelectorAll('[data-dm]').forEach(b => (b.onclick = () => { const r = S.reqs.find(x => x.uid === b.dataset.dm); openDm(b.dataset.dm, r?.name); }));
        } else {
          const P = S.panel; const q = (P.q || '').toLowerCase();
          const list = S.loans.filter(l => !q || (l.name + l.username + l.title + l.bookId).toLowerCase().includes(q));
          const over = S.loans.filter(l => l.overdue).length;
          body.innerHTML = `<div class="field" style="margin-bottom:8px"><label for="ln-q">Tìm theo người mượn, tên đăng nhập, sách</label><input id="ln-q" value="${esc(P.q || '')}"></div>
            <div class="note">${S.loans.length} lượt đang mượn${over ? `, <b style="color:#b42318">${over} quá hạn</b>` : ''}. Thu hồi sẽ đánh dấu sách đã về thư viện và báo cho người mượn (không hoàn điểm).</div>`
            + (list.length ? `<div class="list">${list.map(l => `<div class="item"><span class="code">${esc(l.bookId)}</span><div style="min-width:0"><div class="t">${esc(l.title)}</div><div class="s" style="${l.overdue ? 'color:#b42318' : ''}">${esc(l.name)} (${esc(l.username)})${l.online ? ' · đang online' : ''} · hạn ${ddmm(l.due)}${l.overdue ? ' · QUÁ HẠN' : ''}</div></div><button class="btn small" data-recall="${l.uid}|${l.bookId}">Thu hồi</button></div>`).join('')}</div>` : '<div class="empty">Không có lượt mượn nào.</div>');
          const inp = $('#ln-q', body);
          inp.oninput = () => { P.q = inp.value; const pos = inp.selectionStart; renderPanel(); const n = $('#ln-q'); n.focus(); n.setSelectionRange(pos, pos); };
          body.querySelectorAll('[data-recall]').forEach(b => (b.onclick = () => { const [uid, book] = b.dataset.recall.split('|'); recall(uid, book, S.loans.find(l => l.uid === uid)?.name); }));
        }
      },
    });
    if (tab) { S.panel.tab = tab; renderPanel(); }
  }
  function decline(r) {
    if (!r) return;
    modal(`<h3>Từ chối yêu cầu</h3><p>${esc(r.name)} · ${r.type === 'buy' ? `${r.qty} × ${esc(r.itemName)}` : esc(r.title)}</p>
      <div class="field" style="text-align:left"><label for="dc-note">Lý do (không bắt buộc, sẽ nhắn cho bạn đọc)</label><input id="dc-note" maxlength="160" placeholder="vd. Sách đang được sửa gáy, em mượn cuốn khác nhé"></div>
      <div class="actions" style="justify-content:center"><button class="btn" id="dc-back">Quay lại</button><button class="btn primary" id="dc-go">Từ chối</button></div>`, (d, close) => {
      $('#dc-note', d).focus();
      $('#dc-back', d).onclick = close;
      $('#dc-go', d).onclick = () => { send({ t: 'lib_req', id: r.id, ok: false, note: $('#dc-note', d).value }); close(); };
    });
  }
  function recall(uid, book, name) {
    const b = bookById(book);
    modal(`<h3>Thu hồi sách</h3><p>«${esc(b?.title || book)}» đang được <b>${esc(name || 'bạn đọc')}</b> mượn. Sách sẽ được tính là đã về thư viện.</p>
      <div class="field" style="text-align:left"><label for="rc-note">Lý do (không bắt buộc)</label><input id="rc-note" maxlength="120" placeholder="vd. Quá hạn trả"></div>
      <div class="actions" style="justify-content:center"><button class="btn" id="rc-back">Quay lại</button><button class="btn primary" id="rc-go">Thu hồi</button></div>`, (d, close) => {
      $('#rc-back', d).onclick = close;
      $('#rc-go', d).onclick = () => { send({ t: 'lib_recall', uid, book, note: $('#rc-note', d).value }); close(); };
    });
  }

  // ---------- Quản lý sách ----------
  function openBooks(filter = {}, tab) {
    lastBooksFilter = { q: '', cat: 'all', shelf: 'all', ...lastBooksFilter, ...filter };
    openPanel({
      kind: 'books', eyebrow: 'Thủ thư', title: 'Quản lý sách',
      tabs: [['books', 'Sách'], ['cats', 'Phân loại'], ['shelves', 'Kệ sách'], ['io', 'Nhập / xuất']],
      render(body, t) {
        if (t === 'books') return renderBooks(body);
        if (t === 'cats') return renderCats(body);
        if (t === 'shelves') return renderShelves(body);
        return renderIO(body);
      },
    });
    if (tab) { S.panel.tab = tab; renderPanel(); }
  }
  function renderBooks(body) {
    const F = lastBooksFilter; const q = F.q.toLowerCase();
    const list = S.catalog.books.filter(b => (F.cat === 'all' || b.category === F.cat) && (F.shelf === 'all' || b.shelf === F.shelf)
      && (!q || (b.id + b.title + (b.author || '')).toLowerCase().includes(q)));
    const total = S.catalog.books.reduce((a, b) => a + b.copies, 0);
    body.innerHTML = `<div class="admin-bar"><button class="btn small primary" id="bk-add">+ Thêm sách</button><span class="s">${S.catalog.books.length} đầu sách · ${total} cuốn</span></div>
      <div class="filters">
        <div class="field"><label for="bk-q">Tìm</label><input id="bk-q" value="${esc(F.q)}" placeholder="Mã, tên sách, tác giả"></div>
        <div class="field"><label for="bk-c">Phân loại</label><select id="bk-c">${catOpts(F.cat, true)}</select></div>
        <div class="field"><label for="bk-s">Kệ</label><select id="bk-s"><option value="all">Tất cả kệ</option>${shelfOpts(F.shelf)}</select></div>
      </div>
      <div class="s" style="margin:6px 0">${list.length} kết quả</div>
      <div class="list">${list.map(b => {
        const out = b.copies - (S.avail[b.id] ?? b.copies);
        return `<div class="item"><span class="code">${esc(b.id)}</span><div style="min-width:0"><div class="t">${esc(b.title)}</div><div class="s">${b.author ? esc(b.author) + ' · ' : ''}${esc(catName(b.category))} · kệ ${esc(b.shelf)} · ${b.copies} cuốn${out ? `, ${out} đang mượn` : ''}${b.borrowable ? '' : ' · đọc tại chỗ'}</div></div>
        <div style="display:flex;gap:4px"><button class="btn small" data-edit="${b.id}">Sửa</button><button class="btn small ghost" data-del="${b.id}" title="Xóa">🗑</button></div></div>`;
      }).join('') || '<div class="empty">Không có sách phù hợp.</div>'}</div>`;
    const qi = $('#bk-q', body);
    qi.oninput = () => { F.q = qi.value; const pos = qi.selectionStart; renderPanel(); const n = $('#bk-q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#bk-c', body).onchange = (e) => { F.cat = e.target.value; renderPanel(); };
    $('#bk-s', body).onchange = (e) => { F.shelf = e.target.value; renderPanel(); };
    $('#bk-add', body).onclick = () => editBook(null, { shelf: F.shelf !== 'all' ? F.shelf : undefined, category: F.cat !== 'all' ? F.cat : undefined });
    body.querySelectorAll('[data-edit]').forEach(b => (b.onclick = () => editBook(b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => {
      const bk = bookById(b.dataset.del);
      modal(`<h3>Xóa sách?</h3><p><b>${esc(bk.id)}</b> · ${esc(bk.title)}<br>Thao tác này không hoàn tác được.</p><div class="actions" style="justify-content:center"><button class="btn" id="x-back">Giữ lại</button><button class="btn primary" id="x-go">Xóa sách</button></div>`,
        (d, close) => { $('#x-back', d).onclick = close; $('#x-go', d).onclick = () => { send({ t: 'lib_bookDelete', id: bk.id }); close(); }; });
    }));
  }
  function suggestId(category) {
    const prefix = (S.catalog.books.find(b => b.category === category)?.id.split('-')[0]) || 'BK';
    let n = 1; while (bookById(`${prefix}-${String(n).padStart(2, '0')}`)) n++;
    return `${prefix}-${String(n).padStart(2, '0')}`;
  }
  function editBook(id, preset = {}) {
    const b = id ? bookById(id) : null;
    const cat0 = b?.category || preset.category || S.catalog.categories[0]?.id;
    const v = b ? { ...b } : { id: suggestId(cat0), title: '', author: '', category: cat0, shelf: preset.shelf || LAYOUT.shelves[0].id, copies: 1, borrowable: true };
    const loaned = b ? b.copies - (S.avail[b.id] ?? b.copies) : 0;
    openPanel({
      kind: 'bookEdit', static: true, eyebrow: b ? `Sửa sách · ${b.id}` : 'Thêm sách mới', title: b ? b.title : 'Sách mới',
      render(body) {
        body.innerHTML = `<form id="be" class="form" style="padding:0" autocomplete="off">
          <div class="row2"><div class="field"><label for="be-id">Mã sách</label><input id="be-id" value="${esc(v.id)}" maxlength="16" required ${loaned ? 'readonly title="Đang có người mượn nên không đổi mã được"' : ''}><small>Chữ, số, dấu gạch ngang. Vd. IT-09</small></div>
            <div class="field"><label for="be-copies">Số lượng</label><input id="be-copies" type="number" min="${loaned}" max="999" value="${v.copies}" required>${loaned ? `<small>${loaned} cuốn đang được mượn</small>` : ''}</div></div>
          <div class="field"><label for="be-title">Tên sách</label><input id="be-title" value="${esc(v.title)}" maxlength="120" required></div>
          <div class="field"><label for="be-author">Tác giả</label><input id="be-author" value="${esc(v.author || '')}" maxlength="80"></div>
          <div class="row2"><div class="field"><label for="be-cat">Phân loại</label><select id="be-cat">${catOpts(v.category)}</select></div>
            <div class="field"><label for="be-shelf">Đặt ở kệ</label><select id="be-shelf">${shelfOpts(v.shelf)}</select></div></div>
          <label class="check"><input type="checkbox" id="be-borrow" ${v.borrowable ? 'checked' : ''}> Cho mượn về nhà (bỏ chọn nếu chỉ đọc tại chỗ)</label>
          <div class="actions"><button type="button" class="btn ghost" id="be-back">← Danh sách</button><button type="submit" class="btn primary">${b ? 'Lưu thay đổi' : 'Thêm sách'}</button></div>
        </form>`;
        if (!b) $('#be-cat', body).onchange = (e) => { const idI = $('#be-id', body); if (idI.value === suggestId(v.category) || !idI.value) idI.value = suggestId(e.target.value); v.category = e.target.value; };
        $('#be-back', body).onclick = () => openBooks();
        $('#be', body).onsubmit = (e) => {
          e.preventDefault();
          send({ t: 'lib_bookSave', originalId: b?.id || null, book: { id: $('#be-id', body).value, title: $('#be-title', body).value, author: $('#be-author', body).value,
            category: $('#be-cat', body).value, shelf: $('#be-shelf', body).value, copies: +$('#be-copies', body).value, borrowable: $('#be-borrow', body).checked } });
        };
        $('#be-title', body).focus();
      },
    });
  }
  function renderCats(body) {
    const count = (id) => S.catalog.books.filter(b => b.category === id).length;
    body.innerHTML = `<form class="admin-bar" id="ct-new"><input id="ct-name" maxlength="60" placeholder="Tên phân loại mới" style="flex:1;min-width:0"><button class="btn small primary" type="submit">+ Thêm</button></form>
      <div class="list">${S.catalog.categories.map(c => `<div class="item cat-row"><span class="code">${esc(c.id)}</span>
        <input class="cat-name" data-id="${c.id}" value="${esc(c.name)}" maxlength="60" aria-label="Tên phân loại ${esc(c.id)}">
        <div style="display:flex;gap:4px;align-items:center"><span class="s">${count(c.id)} sách</span><button class="btn small" data-save="${c.id}">Lưu</button><button class="btn small ghost" data-cdel="${c.id}" ${count(c.id) ? 'disabled title="Còn sách thuộc phân loại này"' : ''}>🗑</button></div></div>`).join('')}</div>`;
    $('#ct-new', body).onsubmit = (e) => { e.preventDefault(); const n = $('#ct-name', body).value.trim(); if (n) send({ t: 'lib_catSave', name: n }); };
    body.querySelectorAll('[data-save]').forEach(b => (b.onclick = () => send({ t: 'lib_catSave', id: b.dataset.save, name: body.querySelector(`.cat-name[data-id="${b.dataset.save}"]`).value })));
    body.querySelectorAll('[data-cdel]').forEach(b => (b.onclick = () => send({ t: 'lib_catDelete', id: b.dataset.cdel })));
  }
  function renderShelves(body) {
    body.innerHTML = `<div class="note">Mỗi kệ có mã số in trên nhãn kệ trong thư viện (K01–K${String(LAYOUT.shelves.length).padStart(2, '0')}). Đặt tên hiển thị cho kệ, hoặc để trống để tự lấy theo phân loại có nhiều sách nhất trên kệ. Sách thuộc kệ nào được chọn khi thêm/sửa sách.</div>
      <div class="list">${LAYOUT.shelves.map(s => {
        const n = booksOnShelf(s.id).length;
        return `<div class="item cat-row"><span class="code">${s.id}</span>
          <input class="shelf-name" data-id="${s.id}" value="${esc(S.catalog.shelfLabels?.[s.id] || '')}" maxlength="40" placeholder="${esc(shelfName(s.id) || 'Kệ trống')} (tự động)" aria-label="Tên kệ ${s.id}">
          <div style="display:flex;gap:4px;align-items:center"><span class="s">${n} sách</span><button class="btn small" data-lbl="${s.id}">Lưu</button><button class="btn small ghost" data-view="${s.id}">Xem</button></div></div>`;
      }).join('')}</div>`;
    body.querySelectorAll('[data-lbl]').forEach(b => (b.onclick = () => send({ t: 'lib_shelfLabel', shelf: b.dataset.lbl, label: body.querySelector(`.shelf-name[data-id="${b.dataset.lbl}"]`).value })));
    body.querySelectorAll('[data-view]').forEach(b => (b.onclick = () => { lastBooksFilter.shelf = b.dataset.view; lastBooksFilter.cat = 'all'; S.panel.tab = 'books'; renderPanel(); }));
  }
  function exportCSV() {
    const lines = [CSV_COLS.map(c => c[1]).join(',')];
    for (const b of S.catalog.books) lines.push([b.id, b.title, b.author || '', catName(b.category), b.shelf, b.copies, b.borrowable ? 'có' : 'không'].map(csvCell).join(','));
    return '﻿' + lines.join('\r\n');
  }
  function renderIO(body) {
    const st = importState;
    body.innerHTML = `<h3 class="eyebrow" style="color:var(--maroon);margin:4px 0 6px">Nhập sách từ file CSV / Excel</h3>
      <div class="note">Lưu file Excel dạng <b>CSV UTF-8</b>. Dòng đầu là tiêu đề cột: <code>Mã sách, Tên sách, Tác giả, Phân loại, Kệ, Số lượng, Cho mượn về</code>. Phân loại ghi bằng tên hoặc mã (C01…), kệ ghi mã (K01…K16), “Cho mượn về” ghi có/không. Sách trùng mã sẽ được cập nhật.</div>
      <div class="field"><label for="io-file">Chọn file</label><input type="file" id="io-file" accept=".csv,.txt,text/csv"></div>
      <div class="field" style="margin-top:8px"><label for="io-text">…hoặc dán nội dung vào đây</label><textarea id="io-text" rows="5" spellcheck="false" placeholder="Mã sách,Tên sách,Tác giả,Phân loại,Kệ,Số lượng,Cho mượn về&#10;IT-09,Lập trình Python,Nguyễn A,Công nghệ thông tin,K01,3,có">${esc(ioText)}</textarea></div>
      <div class="actions" style="justify-content:flex-start;margin-top:8px"><button class="btn small" id="io-check">Kiểm tra</button><button class="btn small primary" id="io-go" ${st?.rows?.length ? '' : 'disabled'}>Nhập ${st?.rows?.length || ''} dòng</button></div>
      <div id="io-msg">${st?.msg || ''}</div>
      <h3 class="eyebrow" style="color:var(--maroon);margin:18px 0 6px">Xuất danh mục</h3>
      <div class="actions" style="justify-content:flex-start"><button class="btn small" id="io-dl">⬇ Tải file CSV</button><button class="btn small" id="io-copy">Sao chép CSV</button></div>`;
    const check = (text) => {
      const r = parseCSV(text);
      importState = { rows: r.rows, msg: r.error ? `<p class="form-error">${esc(r.error)}</p>` : `<p class="s">Đọc được ${r.rows.length} dòng. Bấm “Nhập” để cập nhật danh mục.</p>` };
      renderPanel();
    };
    $('#io-file', body).onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => check(rd.result); rd.readAsText(f, 'utf-8'); };
    $('#io-text', body).oninput = (e) => { ioText = e.target.value; };
    $('#io-check', body).onclick = () => check($('#io-text', body).value);
    $('#io-go', body).onclick = () => { if (importState?.rows?.length) { send({ t: 'lib_import', rows: importState.rows }); importState = { rows: [], msg: '<p class="s">Đang nhập…</p>' }; renderPanel(); } };
    $('#io-dl', body).onclick = () => {
      const url = URL.createObjectURL(new Blob([exportCSV()], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `danh-muc-sach-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    $('#io-copy', body).onclick = async () => { try { await navigator.clipboard.writeText(exportCSV()); toast('Đã sao chép danh mục dạng CSV.', 'ok'); } catch { toast('Trình duyệt không cho sao chép. Hãy dùng nút Tải file.', 'warn'); } };
  }

  return {
    openRequests, openBooks, editBook, recall,
    onReqs() { if (S.panel?.kind === 'req') renderPanel(); },
    onResult(m) {
      if (m.ok && m.op === 'book' && S.panel?.kind === 'bookEdit') openBooks();
      else if (S.panel?.kind === 'books' || S.panel?.kind === 'req') renderPanel();
    },
    onImport(m) {
      importState = { rows: [], msg: `<p class="${m.errorCount ? 'form-error' : 's'}">Đã thêm ${m.added}, cập nhật ${m.updated} sách.${m.errorCount ? ` ${m.errorCount} dòng lỗi:` : ''}</p>${m.errors.length ? `<ul class="errs">${m.errors.map(e => `<li>Dòng ${e.row + 1}: ${esc(e.error)}</li>`).join('')}</ul>` : ''}` };
      toast(`Nhập xong: thêm ${m.added}, cập nhật ${m.updated}${m.errorCount ? `, lỗi ${m.errorCount}` : ''}.`, m.errorCount ? 'warn' : 'ok');
      if (S.panel?.kind === 'books') renderPanel();
    },
  };
}
