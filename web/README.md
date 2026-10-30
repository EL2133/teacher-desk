# Teacher Desk／教師枱

給一般老師使用的 Teacher Desk／教師枱。功能和校內那一份相同，頁面上不再出現學校名稱。校曆仍使用日曆區同一套控制台，本機開啟 `http://127.0.0.1:5174/admin`。

## 開啟

在這個資料夾雙擊 `start.bat`。網站在 http://localhost:5174 。校內那一份仍用 5173，兩邊可以同時開。

日曆控制台雙擊 `管理台.bat`。

## Google 與 Brevo

這一份用 `elaw3033@gmail.com` 的 Google 帳戶和 Brevo 帳戶，不共用學校那組。

在 `web/.env` 已寫上寄件電郵和管理員電郵。還需要你在那個 Gmail 帳戶裡建立兩組金鑰，再貼進 `web/.env`（不要貼到對話裡）：

- `GOOGLE_CLIENT_ID`：Google Cloud 的網頁 OAuth 用戶端編號。已授權的 JavaScript 來源要包含你實際開啟的網址。
- `BREVO_API_KEY`：Brevo 的 API 金鑰。寄件人必須先在 Brevo 驗證 `elaw3033@gmail.com`。

未填這兩項時，電郵登入、校曆和其餘功能仍可用。Google 按鈕和 PIN 郵件要等金鑰填上才會生效。
