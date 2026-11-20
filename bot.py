"""Витрина «Фламена» — Telegram-бот: запуск Mini App и приём заказов."""

from __future__ import annotations

import html
import json
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Update,
    WebAppInfo,
)
from telegram.constants import ChatType
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_ID = int(os.getenv("ADMIN_ID", "0") or 0)
WEBAPP_URL = os.getenv(
    "WEBAPP_URL", "https://cepoeympo.github.io/DukeTestShopBot/"
).strip()
ORDER_LIMIT = 4096
MSK = ZoneInfo("Europe/Moscow")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
log = logging.getLogger("shopbot")


# ─────────────────────────── вспомогательное ───────────────────────────


def shop_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("Открыть витрину", web_app=WebAppInfo(url=WEBAPP_URL))]]
    )


async def reply(update: Update, text: str, **kwargs) -> None:
    """Ответ в чат, устойчивый к отсутствию сообщения в апдейте."""
    message = update.effective_message
    if message is not None:
        await message.reply_text(text, **kwargs)


def money(value: float) -> str:
    return f"{value:,.0f}".replace(",", " ") + " ₽"


def order_number(ts_ms: int) -> str:
    stamp = datetime.fromtimestamp(ts_ms / 1000, MSK)
    return f"ФЛ-{stamp:%y%m%d}-{stamp:%H%M}"


def render_order(order: dict, user) -> str:
    """Текст заказа для менеджера."""
    rows: list[str] = []
    total = 0.0
    for i, item in enumerate(order.get("items") or [], 1):
        price = float(item.get("price", 0))
        qty = int(item.get("qty", 0))
        total += price * qty
        name = html.escape(str(item.get("name", "—")))
        rows.append(f"{i}. {name} — {qty} × {money(price)} = {money(price * qty)}")

    customer = order.get("customer") or {}
    ts = int(order.get("ts", 0) or 0)
    lines = [
        f"<b>Новый заказ {order_number(ts)}</b>",
        "",
        *rows,
        "",
        f"<b>Итого: {money(total)}</b>",
        "",
        f"Имя: {html.escape(str(customer.get('name', '—')))}",
        f"Телефон: {html.escape(str(customer.get('phone', '—')))}",
    ]
    if customer.get("city"):
        lines.append(f"Доставка: {html.escape(str(customer['city']))}")
    if customer.get("note"):
        lines.append(f"Комментарий: {html.escape(str(customer['note']))}")
    if user is not None:
        uname = f"@{user.username}" if user.username else "без username"
        lines += ["", f"Клиент: {html.escape(user.full_name)} — {uname}"]
        lines.append(f"Написать: <a href='tg://user?id={user.id}'>открыть чат</a>")
    return "\n".join(lines)


# ─────────────────────────── хендлеры ───────────────────────────


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "👋 <b>Витрина «Фламена»</b>\n\n"
        "Гели, гелевые покрытия и косметика на липосомальной платформе — "
        "отгрузка со склада производителя.\n\n"
        "Откройте приложение: каталог, состав, документы и оформление заказа "
        "в пару нажатий."
    )
    await reply(update, text, reply_markup=shop_keyboard(), parse_mode="HTML")


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "<b>Что умеет бот</b>\n\n"
        "/start — витрина и кнопка входа\n"
        "/help — эта справка\n"
        "/id — ваш Telegram ID\n\n"
        "Заказ оформляется в приложении: корзина → контакты → «Оформить заказ». "
        "Менеджер подтвердит наличие, доставку СДЭК и оплату."
    )
    await reply(update, text, parse_mode="HTML")


async def cmd_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    uid = user.id if user else 0
    await reply(update, f"Ваш ID: <code>{uid}</code>", parse_mode="HTML")


async def on_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    raw = message.web_app_data.data if message and message.web_app_data else ""
    if not raw:
        return
    if len(raw) > ORDER_LIMIT:
        log.warning("заказ превысил лимит: %s байт", len(raw))
        await reply(update, "Заказ слишком большой. Свяжитесь с менеджером.")
        return

    try:
        order = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("мусор в web_app_data: %r", raw[:200])
        await reply(update, "Не удалось разобрать заказ. Попробуйте ещё раз.")
        return

    if order.get("type") != "order" or not order.get("items"):
        log.info("payload без товаров: %r", raw[:200])
        await reply(update, "Пустой заказ. Добавьте товары в корзину.")
        return

    user = update.effective_user
    number = order_number(int(order.get("ts", 0) or 0))
    log.info(
        "заказ %s от %s: %s позиций",
        number,
        user.id if user else "?",
        len(order["items"]),
    )

    await reply(
        update,
        f"✅ Заказ <b>{number}</b> принят.\n"
        "Менеджер свяжется с вами, подтвердит наличие, доставку и оплату.",
        parse_mode="HTML",
        reply_markup=shop_keyboard(),
    )

    if not ADMIN_ID:
        log.warning("ADMIN_ID не задан — заказ не переслан")
        return

    try:
        await context.bot.send_message(
            ADMIN_ID,
            render_order(order, user),
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
    except Exception:  # сеть или админ заблокировал бота
        log.exception("не удалось переслать заказ %s админу", number)


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat is None:
        return
    if update.effective_chat.type != ChatType.PRIVATE:
        return
    await reply(
        update,
        "Открыть витрину можно кнопкой ниже 👇",
        reply_markup=shop_keyboard(),
    )


async def post_init(app: Application) -> None:
    await app.bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Витрина", web_app=WebAppInfo(url=WEBAPP_URL)
        )
    )
    await app.bot.set_my_commands(
        [
            ("start", "Витрина «Фламена»"),
            ("help", "Справка"),
            ("id", "Мой Telegram ID"),
        ]
    )
    me = await app.bot.get_me()
    log.info("бот @%s готов, витрина: %s", me.username, WEBAPP_URL)


def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("BOT_TOKEN не найден в .env")

    app = Application.builder().token(BOT_TOKEN).post_init(post_init).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("id", cmd_id))
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, on_webapp_data))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    log.info("polling…")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
