# AGENTS.md — DukeTestShopBot (витрина «Фламена»)

## Что это

Telegram Mini App (Web App) — витрина продукции «Фламена»: каталог, карточка
товара, избранное, корзина, оформление заказа. Заказ уходит в Telegram-бота,
бот пересылает его менеджеру.

Два независимых слоя:

1. **Фронтенд** (GitHub Pages, статика без сборки): `index.html`, `style.css`,
   `app.js`, `data.js`, `img/products/*.webp`.
2. **Бот** (`bot.py`, python-telegram-bot 21.x): точка входа в Web App и приём
   заказов через `web_app_data`.

## Доменная модель

- `PRODUCTS` (`data.js`): `{id, title, sub, cat, price, old, img, badge?, short,
  specs[[ключ, значение]], desc[абзацы], note}`.
- `CATEGORIES`: `all | gel | face | hands | sets`.
- Корзина в `localStorage['flamena.cart.v1']`: `{productId: qty}`.
- Избранное в `localStorage['flamena.fav.v1']`: массив id.
- Заказ (`sendData` payload): `{type:'order', ts, items[{id,name,price,qty}],
  total, customer{name,phone,city,note}, source}`.

## Инварианты

- `data.js` — единственный источник товаров. Никаких цен и названий в HTML/JS.
- Фронтенд без фреймворков и сборки: только vanilla JS + один файл стилей.
  Причина: Mini App открывается в старом WebView, вес и совместимость важнее.
- Все цвета — через CSS-переменные из `--bg/--card/--text/--hint/--line`, которые
  `applyTheme()` заполняет из `Telegram.WebApp.themeParams`. Хардкод белого/чёрного
  в компонентах не добавлять.
- Не ставить CSS-transition на свойства, чьё значение берётся из тематических
  переменных (`background`, `color`, `border-color`): Chromium не перерисовывает
  их при смене темы, элемент «залипает» в старом цвете. Смена темы идёт под
  классом `html.no-anim`.
- `sendData` работает только при запуске из web_app-кнопки и закрывает окно:
  в ветке без `initData` обязателен резервный путь (текст заказа + «Скопировать»).
- Учёт safe-area: `env(safe-area-inset-*)` в topbar, sheet и tabbar.
- Дисклеймер о противопоказаниях присутствует на всех экранах с товарами.

## Проверки перед коммитом

```bash
ruff check .                  # ожидается: All checks passed!
python -m py_compile bot.py
node --check app.js data.js   # синтаксис JS
```

## Запуск и обслуживание

```bash
python3 -m http.server 8099 --bind 127.0.0.1   # локальный просмотр
python bot.py                                  # бот (нужен .env)
sudo systemctl restart shopbot && journalctl -u shopbot -n 30 --no-pager
```

Логи бота — stdout/journald, уровень INFO. Ключевые события:
`бот @… готов`, `заказ ФЛ-… от <id>: N позиций`, `не удалось переслать заказ`.

## Чего не делать

- Не пушить `.env`, токены, `__pycache__`.
- Не менять формат payload без правки `render_order()` в `bot.py`.
- Не добавлять внешние JS-библиотеки (кроме официального `telegram-web-app.js`).
- Не тянуть картинки хотлинком с flamenashop.ru: фото лежат локально в WebP.
