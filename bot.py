import os
import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, ContextTypes
from dotenv import load_dotenv

# -------------------- Инициализация --------------------
load_dotenv() # Загружаем переменные окружения из .env файла
BOT_TOKEN = os.getenv("BOT_TOKEN")
DUKE_ID = os.getenv("DUKE_ID")
print(f"Токен успешно загружен. Бот запущен.")  # Для проверки

if not BOT_TOKEN:
    raise ValueError("Токен бота не найден. Проверьте файл .env")

# URL = f"https://api.telegram.org/bot{BOT_TOKEN}/setChatMenuButton"

data = {
    "menu_button": {
        "type": "web_app",
        "text": "Open Web App Button",
        "web_app": {
            "url": "https://cepoeympo.github.io/DukeTestShopBot/main.html"
        }
    }
}

# response = requests.post(URL, json=data)
# print(response.json())

# Команда /start
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    keyboard = [
        [
            InlineKeyboardButton(
                text="Open Web App Inline Button",
                web_app=WebAppInfo(url="https://cepoeympo.github.io/DukeTestShopBot/main.html")
            )
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        text="Click the button below to open the web app:",
        reply_markup=reply_markup
    )

# Основная функция
def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    # app.add_handler(CallbackQueryHandler(button_handler))

    print("Bot is running...")
    app.run_polling()

if __name__ == "__main__":
    main()
