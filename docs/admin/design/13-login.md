# 13. Вхід

Волна 2, экран 13.

- Устройство: desktop 1440
- Поля и кнопки — из фундамента. Оболочки нет: пользователь ещё не вошёл

## Зачем этот экран

Вход в CRM для сотрудников. Регистрации нет: пользователей приглашает владелец в «Налаштуваннях».

## Макет

Светло-серый фон CRM. По центру белая панель около 400px:

- `Лапка` словесным знаком, под ним `CRM`
- H1 `Вхід`
- `Email` — поле
- `Пароль` — поле с иконкой показать/скрыть
- Primary на всю ширину `Увійти`
- Quiet ссылка `Забули пароль?`

Под панелью мелко: `Доступ лише для працівників магазину.`

Состояние ошибки (рисовать на этом же экране, под полем пароля): `Неправильний email або пароль.` Поле пароля в состоянии error.

## Не делать

- Иллюстрации, фото товаров, слоганы.
- Вход через соцсети.
- Регистрацию.

## STITCH PROMPT

```text
Design ONE desktop screen at 1440px: the sign-in page of “Лапка CRM”, the back office of a Ukrainian toy store. Use the accepted CRM foundation fields and buttons. No sidebar.

Cool light-gray background. Centered white panel about 400px wide: wordmark “Лапка” with label “CRM”, H1 “Вхід”, field “Email” filled with “olena@lapka.ua”, field “Пароль” with show/hide icon in error state and error text “Неправильний email або пароль.”, full-width primary button “Увійти”, quiet link “Забули пароль?”. Small text under the panel: “Доступ лише для працівників магазину.”

No illustrations, no social login, no sign-up. All visible copy in Ukrainian exactly as written.
```
