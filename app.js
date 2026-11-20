/* Фламена — витрина. Логика мини-приложения (vanilla JS, без сборки). */
(() => {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const CFG = window.SHOP_CONFIG;
  const PRODUCTS = window.PRODUCTS;
  const CATS = window.CATEGORIES;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const KEY_CART = 'flamena.cart.v1';
  const KEY_FAV = 'flamena.fav.v1';

  const state = {
    view: 'catalog',
    cat: 'all',
    query: '',
    cart: load(KEY_CART, {}),
    fav: load(KEY_FAV, []),
    form: { name: '', phone: '', city: '', note: '' },
  };

  let sheetData = null;

  /* ───────── утилиты ───────── */

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY_CART, JSON.stringify(state.cart));
      localStorage.setItem(KEY_FAV, JSON.stringify(state.fav));
    } catch (e) { /* приватный режим */ }
  }

  const money = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const disc = (p) => (p.old ? Math.round((1 - p.price / p.old) * 100) : 0);

  function cartItems() {
    return Object.keys(state.cart)
      .map((id) => ({ p: byId(id), qty: state.cart[id] }))
      .filter((it) => it.p && it.qty > 0);
  }
  const cartCount = () => cartItems().reduce((s, it) => s + it.qty, 0);
  const cartTotal = () => cartItems().reduce((s, it) => s + it.qty * it.p.price, 0);

  function haptic(kind) {
    if (!tg || !tg.HapticFeedback) return;
    try {
      if (kind === 'add') tg.HapticFeedback.impactOccurred('medium');
      else if (kind === 'tap') tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.impactOccurred('light');
    } catch (e) { /* noop */ }
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('#toast');
    $('#toastText').textContent = text;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 1900);
  }

  /* ───────── корзина ───────── */

  function addToCart(id, qty = 1) {
    state.cart[id] = Math.min(99, (state.cart[id] || 0) + qty);
    save();
    syncChrome();
    haptic('add');
    const p = byId(id);
    toast(p ? `В корзине: ${p.title}` : 'Добавлено');
  }

  function setQty(id, qty) {
    if (qty <= 0) delete state.cart[id];
    else state.cart[id] = Math.min(99, qty);
    save();
    syncChrome();
    renderView();
  }

  function toggleFav(id) {
    const i = state.fav.indexOf(id);
    if (i === -1) state.fav.push(id);
    else state.fav.splice(i, 1);
    save();
    haptic('tap');
    syncChrome();
    renderView();
  }

  function syncChrome() {
    const n = cartCount();
    const badge = $('#cartBadge');
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    $('#tabCartDot').hidden = n === 0;
    $('#favDot').hidden = state.fav.length === 0;
    if (tg && tg.enableClosingConfirmation && tg.disableClosingConfirmation) {
      try {
        if (n > 0) tg.enableClosingConfirmation();
        else tg.disableClosingConfirmation();
      } catch (e) { /* noop */ }
    }
  }

  /* ───────── рендер каталога ───────── */

  function productCard(p) {
    const d = disc(p);
    const fav = state.fav.includes(p.id);
    const pill = d ? `<span class="pill">−${d}%</span>` : p.badge ? `<span class="pill pill--soft">${esc(p.badge)}</span>` : '';
    return `
      <article class="product" data-open="${p.id}">
        <div class="product__media">
          ${pill}
          <button class="fav-btn ${fav ? 'is-on' : ''}" data-fav="${p.id}" aria-label="В избранное">
            <svg><use href="#${fav ? 'i-heart-fill' : 'i-heart'}"/></svg>
          </button>
          <img src="${p.img}" alt="${esc(p.title)}" loading="lazy" decoding="async" width="360" height="360">
        </div>
        <div class="product__body">
          <div class="product__title">${esc(p.title)}</div>
          <div class="product__sub">${esc(p.sub)}</div>
          <div class="product__foot">
            <div>
              <span class="price">${money(p.price)}</span>
              ${p.old ? `<span class="price__old">${money(p.old)}</span>` : ''}
            </div>
            <button class="add-btn" data-add="${p.id}" aria-label="Добавить в корзину">
              <svg><use href="#i-plus"/></svg>
            </button>
          </div>
        </div>
      </article>`;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      const catOk = state.cat === 'all' || p.cat === state.cat;
      if (!catOk) return false;
      if (!q) return true;
      const hay = [p.title, p.sub, p.short, p.badge || ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function renderChips() {
    $('#chips').innerHTML = CATS.map((c) => `
      <button class="chip ${state.cat === c.id ? 'is-active' : ''}" data-cat="${c.id}">
        <svg><use href="#i-${c.icon}"/></svg>${esc(c.name)}
      </button>`).join('');
  }

  function renderCatalog() {
    const list = filtered();
    $('#grid').innerHTML = list.map(productCard).join('');
    $('#gridEmpty').hidden = list.length > 0;
    const cat = CATS.find((c) => c.id === state.cat);
    $('#catTitle').textContent = state.query.trim() ? 'Результаты поиска' : cat ? cat.name : 'Каталог';
    $('#catCount').textContent = `${list.length} ${plural(list.length, ['товар', 'товара', 'товаров'])}`;
  }

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  /* ───────── избранное ───────── */

  function renderFav() {
    const list = PRODUCTS.filter((p) => state.fav.includes(p.id));
    const el = $('#view-fav');
    if (!list.length) {
      el.innerHTML = `
        <div class="view-head"><h2>Избранное</h2><p>Здесь появятся товары, которые вы отметили</p></div>
        <div class="empty">
          <svg class="empty__icon"><use href="#i-heart"/></svg>
          <b>Пока пусто</b>
          <p>Нажмите на сердечко в карточке товара</p>
        </div>
        <div class="actions"><button class="btn btn--ghost" data-view-btn="catalog">Перейти в каталог</button></div>`;
      return;
    }
    el.innerHTML = `
      <div class="view-head"><h2>Избранное</h2><p>${list.length} ${plural(list.length, ['товар', 'товара', 'товаров'])}</p></div>
      <div class="grid">${list.map(productCard).join('')}</div>
      <div class="actions"><button class="btn btn--ghost" data-view-btn="catalog">Добавить ещё</button></div>`;
  }

  /* ───────── корзина ───────── */

  function cartRow(it) {
    return `
      <div class="cart-item" data-open="${it.p.id}">
        <div class="cart-item__thumb"><img src="${it.p.img}" alt="" loading="lazy"></div>
        <div class="cart-item__info">
          <div class="cart-item__name">${esc(it.p.title)}</div>
          <div class="cart-item__row">
            <div class="stepper" data-stop>
              <button data-qty="${it.p.id}" data-delta="-1" aria-label="Меньше"><svg><use href="#i-minus"/></svg></button>
              <span>${it.qty}</span>
              <button data-qty="${it.p.id}" data-delta="1" aria-label="Больше"><svg><use href="#i-plus"/></svg></button>
            </div>
            <span class="cart-item__price">${money(it.qty * it.p.price)}</span>
          </div>
        </div>
        <button class="cart-item__del" data-del="${it.p.id}" aria-label="Удалить"><svg><use href="#i-close"/></svg></button>
      </div>`;
  }

  function renderCart() {
    const items = cartItems();
    const el = $('#view-cart');
    if (!items.length) {
      el.innerHTML = `
        <div class="view-head"><h2>Корзина</h2><p>Корзина пуста</p></div>
        <div class="empty">
          <svg class="empty__icon"><use href="#i-cart"/></svg>
          <b>Ничего не выбрано</b>
          <p>Гели, покрытия и косметика — в каталоге</p>
        </div>
        <div class="actions"><button class="btn" data-view-btn="catalog">Открыть каталог</button></div>`;
      return;
    }
    const total = cartTotal();
    const count = cartItems().reduce((s, it) => s + it.qty, 0);
    const saved = items.reduce((s, it) => s + (it.p.old ? (it.p.old - it.p.price) * it.qty : 0), 0);
    el.innerHTML = `
      <div class="view-head"><h2>Корзина</h2><p>${count} ${plural(count, ['товар', 'товара', 'товаров'])}</p></div>
      <div class="cart-list">${items.map(cartRow).join('')}</div>
      <div class="panel">
        <div class="sum-row"><span>Товары</span><b>${money(total + saved)}</b></div>
        ${saved ? `<div class="sum-row"><span>Скидка</span><b>−${money(saved)}</b></div>` : ''}
        <div class="sum-row"><span>Доставка</span><b>СДЭК, по тарифу</b></div>
        <div class="sum-row sum-row--total"><span>Итого</span><b>${money(total)}</b></div>
      </div>
      <div class="panel">
        <h3>Контакты для заказа</h3>
        <label class="field"><span>Имя</span><input id="fName" data-f="name" type="text" value="${esc(state.form.name)}" placeholder="Как к вам обращаться" autocomplete="name"></label>
        <label class="field"><span>Телефон</span><input id="fPhone" data-f="phone" type="tel" inputmode="tel" value="${esc(state.form.phone)}" placeholder="+7 900 000-00-00" autocomplete="tel"></label>
        <label class="field"><span>Город и пункт СДЭК</span><input id="fCity" data-f="city" type="text" value="${esc(state.form.city)}" placeholder="Москва, ПВЗ на Тверской" autocomplete="address-level2"></label>
        <label class="field"><span>Комментарий</span><textarea id="fNote" data-f="note" placeholder="Пожелания к заказу">${esc(state.form.note)}</textarea></label>
      </div>
      <div class="actions"><button class="btn" id="btnCheckout">Оформить заказ · ${money(total)}</button></div>
      <p class="note">После оформления менеджер подтвердит наличие, стоимость доставки и способ оплаты. Отгрузка со склада производителя.</p>`;
  }

  /* ───────── о бренде ───────── */

  function renderInfo() {
    $('#view-info').innerHTML = `
      <div class="view-head"><h2>О бренде</h2><p>Научная компания «Фламена»</p></div>
      <div class="info-hero">
        <b>Липосомальная платформа, а не просто косметика</b>
        <p>Компания основана в 2005 году. Название сложено из слов «ФЛАвоноиды», «МЕдицина», «НАука».
        Разработан и запатентован липосомально-антиоксидантный комплекс, который работает и как активное
        вещество, и как транспорт для доставки компонентов в кожу и слизистые.</p>
      </div>
      <div class="stats">
        <div class="stat"><b>2005</b><span>год основания</span></div>
        <div class="stat"><b>250–300</b><span>нм средний размер липосом</span></div>
        <div class="stat"><b>6+</b><span>патентов РФ</span></div>
      </div>
      <div style="padding:16px 18px 2px"><span style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--hint)">Вопросы</span></div>
      ${window.FAQ.map((f) => `
        <details class="faq">
          <summary>${esc(f.q)}<svg><use href="#i-chevron"/></svg></summary>
          <p>${esc(f.a)}</p>
        </details>`).join('')}
      <div style="padding:18px 18px 2px"><span style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--hint)">Связаться</span></div>
      <div class="contacts">
        <a class="contact" href="tel:${CFG.phone.replace(/[^+\d]/g, '')}">
          <svg><use href="#i-info"/></svg>
          <span>${esc(CFG.phone)}<small>Отдел продаж</small></span>
        </a>
        <a class="contact" href="tel:${CFG.phone2.replace(/[^+\d]/g, '')}">
          <svg><use href="#i-info"/></svg>
          <span>${esc(CFG.phone2)}<small>Мобильный</small></span>
        </a>
        <a class="contact" href="${CFG.site}" data-external>
          <svg><use href="#i-grid"/></svg>
          <span>flamenashop.ru<small>Полный каталог и документы</small></span>
        </a>
      </div>
      <p class="disclaimer">Продукция не является лекарственным средством, кроме позиций с указанием регистрационного удостоверения. Имеются противопоказания. Необходимо ознакомиться с инструкцией или проконсультироваться со специалистом.</p>`;
  }

  /* ───────── виды ───────── */

  const RENDERERS = {
    catalog: renderCatalog,
    fav: renderFav,
    cart: renderCart,
    info: renderInfo,
  };

  function renderView() {
    if (state.view === 'catalog') renderCatalog();
    else RENDERERS[state.view]();
  }

  function go(view, opts = {}) {
    if (!RENDERERS[view]) return;
    state.view = view;
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.viewBtn === view));
    renderView();
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (tg && tg.BackButton) {
      try {
        if (view === 'catalog') tg.BackButton.hide();
        else tg.BackButton.show();
      } catch (e) { /* noop */ }
    }
  }

  /* ───────── шторка товара ───────── */

  const sheet = $('#sheet');
  const backdrop = $('#backdrop');

  function openSheet(html) {
    $('#sheetBody').innerHTML = html;
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
    if (tg && tg.BackButton) {
      try { tg.BackButton.show(); } catch (e) { /* noop */ }
    }
  }

  function closeSheet() {
    backdrop.classList.remove('is-open');
    sheet.classList.remove('is-open');
    sheet.style.transform = '';
    sheetData = null;
    if (tg && tg.BackButton) {
      try {
        if (state.view === 'catalog') tg.BackButton.hide();
      } catch (e) { /* noop */ }
    }
  }

  function openProduct(id) {
    const p = byId(id);
    if (!p) return;
    const d = disc(p);
    let qty = 1;
    sheetData = { id, qty: () => qty, set: (v) => { qty = v; } };
    openSheet(`
      <div class="pd">
        <div class="pd__media"><img src="${p.img}" alt="${esc(p.title)}"></div>
        <div class="pd__head">
          <div>
            <h2 class="pd__title">${esc(p.title)}</h2>
            <p class="pd__sub">${esc(p.sub)}</p>
          </div>
          <div class="pd__prices">
            <div class="pd__price">${money(p.price)}</div>
            ${p.old ? `<span class="price__old">${money(p.old)}${d ? ' · −' + d + '%' : ''}</span>` : ''}
          </div>
        </div>
        <div class="pd__text">${p.desc.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
        <div class="pd__specs">${p.specs.map(([k, v]) => `<div class="spec"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>
        ${p.note ? `<p class="pd__note">${esc(p.note)}</p>` : ''}
        <div class="pd__bar">
          <div class="stepper">
            <button data-pd-delta="-1" aria-label="Меньше"><svg><use href="#i-minus"/></svg></button>
            <span id="pdQty">1</span>
            <button data-pd-delta="1" aria-label="Больше"><svg><use href="#i-plus"/></svg></button>
          </div>
          <button class="btn" id="pdAdd">В корзину · ${money(p.price)}</button>
        </div>
      </div>`);
  }

  function updatePdBar() {
    if (!sheetData) return;
    const p = byId(sheetData.id);
    const q = sheetData.qty();
    $('#pdQty').textContent = q;
    $('#pdAdd').textContent = `В корзину · ${money(p.price * q)}`;
  }

  /* ───────── оформление заказа ───────── */

  function orderText(order) {
    const lines = ['Заказ с витрины «Фламена»', ''];
    order.items.forEach((it, i) => {
      lines.push(`${i + 1}. ${it.name} — ${it.qty} × ${it.price} ₽ = ${it.qty * it.price} ₽`);
    });
    lines.push('', `Итого: ${order.total} ₽`);
    if (order.customer.name) lines.push(`Имя: ${order.customer.name}`);
    if (order.customer.phone) lines.push(`Телефон: ${order.customer.phone}`);
    if (order.customer.city) lines.push(`Доставка: ${order.customer.city}`);
    if (order.customer.note) lines.push(`Комментарий: ${order.customer.note}`);
    return lines.join('\n');
  }

  function checkout() {
    const items = cartItems();
    if (!items.length) return;
    const name = ($('#fName') || {}).value || '';
    const phone = ($('#fPhone') || {}).value || '';
    const city = ($('#fCity') || {}).value || '';
    const note = ($('#fNote') || {}).value || '';

    if (name.trim().length < 2) { toast('Укажите имя'); $('#fName').focus(); return; }
    if (phone.replace(/\D/g, '').length < 10) { toast('Укажите телефон'); $('#fPhone').focus(); return; }

    const order = {
      type: 'order',
      ts: Date.now(),
      items: items.map((it) => ({ id: it.p.id, name: it.p.title, price: it.p.price, qty: it.qty })),
      total: cartTotal(),
      customer: { name: name.trim(), phone: phone.trim(), city: city.trim(), note: note.trim() },
      source: tg ? 'telegram' : 'web',
    };

    const text = orderText(order);

    if (tg && tg.sendData && tg.initData) {
      try {
        tg.sendData(JSON.stringify(order));
        return;
      } catch (e) { /* упадём в резервную ветку */ }
    }

    openSheet(`
      <div class="pd">
        <h2 class="pd__title">Заказ готов</h2>
        <p class="pd__sub">Приложение открыто вне Telegram — отправьте текст менеджеру</p>
        <pre class="order-preview" id="orderPreview">${esc(text)}</pre>
        <div class="actions" style="padding:12px 0 0">
          <button class="btn" id="btnCopy">Скопировать заказ</button>
          ${CFG.botUsername ? `<a class="btn btn--ghost" style="text-align:center;text-decoration:none" href="https://t.me/${CFG.botUsername}">Открыть Telegram-бот</a>` : ''}
        </div>
      </div>`);
  }

  function copyOrder() {
    const el = $('#orderPreview');
    if (!el) return;
    const text = el.textContent;
    const done = () => toast('Заказ скопирован');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Не удалось скопировать'); }
    document.body.removeChild(ta);
  }

  /* ───────── события ───────── */

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view-btn]');
    if (t) { haptic('tap'); closeSheet(); go(t.dataset.viewBtn); return; }

    const cat = e.target.closest('[data-cat]');
    if (cat) { haptic('tap'); state.cat = cat.dataset.cat; renderChips(); renderCatalog(); return; }

    const fav = e.target.closest('[data-fav]');
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }

    const add = e.target.closest('[data-add]');
    if (add) { e.stopPropagation(); addToCart(add.dataset.add, 1); return; }

    const qty = e.target.closest('[data-qty]');
    if (qty) {
      e.stopPropagation();
      const id = qty.dataset.qty;
      setQty(id, (state.cart[id] || 0) + Number(qty.dataset.delta));
      haptic('tap');
      return;
    }

    const del = e.target.closest('[data-del]');
    if (del) { setQty(del.dataset.del, 0); haptic('light'); return; }

    const open = e.target.closest('[data-open]');
    if (open) { openProduct(open.dataset.open); return; }

    if (e.target.closest('#btnCart')) { haptic('tap'); go('cart'); return; }

    if (e.target.closest('#btnCheckout')) { checkout(); return; }
    if (e.target.closest('#btnCopy')) { copyOrder(); return; }

    const pdDelta = e.target.closest('[data-pd-delta]');
    if (pdDelta && sheetData) {
      const next = Math.min(99, Math.max(1, sheetData.qty() + Number(pdDelta.dataset.pdDelta)));
      sheetData.set(next);
      updatePdBar();
      haptic('tap');
      return;
    }

    const pdAdd = e.target.closest('#pdAdd');
    if (pdAdd && sheetData) {
      const id = sheetData.id;
      const q = sheetData.qty();
      closeSheet();
      addToCart(id, q);
      return;
    }

    const ext = e.target.closest('[data-external]');
    if (ext) {
      e.preventDefault();
      const url = ext.getAttribute('href');
      if (tg && tg.openLink) tg.openLink(url);
      else window.open(url, '_blank', 'noopener');
      return;
    }

    if (e.target === backdrop) closeSheet();
  });

  document.addEventListener('input', (e) => {
    const f = e.target.closest('[data-f]');
    if (f) state.form[f.dataset.f] = f.value;
  });

  $('#btnSearch').addEventListener('click', () => {
    const bar = $('#searchbar');
    const open = bar.hidden;
    bar.hidden = !open;
    if (open) {
      if (state.view !== 'catalog') go('catalog');
      $('#searchInput').focus();
    } else {
      $('#searchInput').value = '';
      state.query = '';
      renderCatalog();
    }
  });

  $('#searchInput').addEventListener('input', (e) => {
    state.query = e.target.value;
    if (state.view !== 'catalog') go('catalog');
    renderCatalog();
  });

  $('#btnSearchClose').addEventListener('click', () => {
    $('#searchbar').hidden = true;
    $('#searchInput').value = '';
    state.query = '';
    renderCatalog();
  });

  window.addEventListener('scroll', () => {
    $('.topbar').classList.toggle('is-scrolled', window.scrollY > 4);
  }, { passive: true });

  /* свайп вниз по ручке шторки */
  (() => {
    const handle = $('.sheet__handle');
    let startY = 0;
    let dy = 0;
    handle.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      dy = 0;
      sheet.style.transition = 'none';
    }, { passive: true });
    handle.addEventListener('touchmove', (e) => {
      dy = Math.max(0, e.touches[0].clientY - startY);
      sheet.style.transform = `translate(-50%, ${dy}px)`;
    }, { passive: true });
    handle.addEventListener('touchend', () => {
      sheet.style.transition = '';
      if (dy > 90) closeSheet();
      else sheet.style.transform = '';
    });
  })();

  /* ───────── Telegram init ───────── */

  function applyTheme() {
    if (!tg) return;
    try {
      tg.setHeaderColor('#ffffff');
      tg.setBackgroundColor('#ffffff');
    } catch (e) { /* старые клиенты */ }
  }

  function initTelegram() {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      applyTheme();
      if (tg.BackButton) tg.BackButton.onClick(() => {
        if (sheet.classList.contains('is-open')) closeSheet();
        else go('catalog');
      });
    } catch (e) { /* noop */ }
  }

  /* ───────── старт ───────── */

  initTelegram();
  renderChips();
  go('catalog');
  syncChrome();

  window.addEventListener('beforeunload', () => {
    if (tg && tg.disableClosingConfirmation) {
      try { tg.disableClosingConfirmation(); } catch (e) { /* noop */ }
    }
  });
})();
