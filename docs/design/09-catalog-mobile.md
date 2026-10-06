# 09. Каталог, mobile

Волна 2. Две генерации. Сначала листинг с закрытыми фильтрами. Потом тот же листинг со шторкой фильтров. Это мобильная версия `02-catalog.md`, не новый каталог.

## Генерация A. Листинг

Шапка как на мобильной главной. В поиске пусто.

Крошки компактно: `Головна / Конструктори`. Если не влезают, последняя крошка сокращается, `Головна` остаётся.

H1 `Конструктори`
Описание можно спрятать за `Детальніше` или показать одной строкой с обрезкой. На макете одна строка видна целиком, она короткая: взять первое предложение. `Конструктори для гри вдома.`
`128 товарів`

Строка на всю ширину: кнопка `Фільтри` с бейджем `2`, селект `Спочатку популярні`.

Чипы под строкой: `6–8 років`, `В наявності`.

Сетка: 2 колонки, те же шесть товаров, что в десктопном каталоге, в том же порядке и с теми же ценами.

Внизу не номера страниц, а кнопка `Показати ще`.

Пагинация-номера на 390 не используется.

## Генерация B. Шторка фильтров

Поверх листинга A, который виден затемнённым сверху. Шторка снизу, высота около 90% экрана, радиус только сверху, тот же токен, что у карточек.

Шапка шторки: `Фільтри`, icon button `Закрити`.

Те же группы, что на десктопе категории «Конструктори»: ціна, вік (`6–8 років` включён), бренд, наявність (`В наявності` включён), кількість деталей.

Низ закреплён, две кнопки в одну строку:

- secondary `Скинути`
- primary `Показати 128`

Большой палец достаёт до primary без прокрутки шторки до конца: низ закреплён, группы скроллятся внутри.

## STITCH PROMPT A

```text
Design ONE mobile screen at 390px for the Ukrainian toy store “Лапка”. Category listing. Reflow of the accepted desktop catalog, same brand and the same product card. Not a new design.

Mobile header: “Меню”, wordmark “Лапка”, cart count 1, full-width search under it.

Breadcrumb “Головна / Конструктори”.
H1 “Конструктори”.
One line “Конструктори для гри вдома.”
“128 товарів”.
Row: button “Фільтри” with a small count 2, and sort value “Спочатку популярні”.
Chips: “6–8 років”, “В наявності”.

2-column grid, six cards, exact desktop data and order:
1. LEGO City «Пожежна частина», 1 890 грн, old 2 290 грн, Хіт, −18%, “В наявності”, “До кошика”
2. “М’яка іграшка «Ведмедик Тео», 31 см”, 1 100 грн, “В наявності”
3. “Настільна гра «Сімейний квіз»”, 649 грн, “Закінчується”
4. “Лялька «Мія з рюкзаком», 32 см”, 890 грн, old 1 150 грн, disabled “Немає в наявності”
5. “Дерев’яний пазл Cubika «Лісова стежка», 48 дет.”, 420 грн, “Очікується”, “Повідомити про наявність”
6. “Набір для творчості «Акварельний ранок»”, 530 грн, “Новинка”, “В наявності”

Button at the end: “Показати ще”. No numbered pagination. Filters are closed. Cards stay readable: price and button visible. All copy in Ukrainian exactly as written.
```

## STITCH PROMPT B

```text
Design ONE mobile screen at 390px for “Лапка”. Same category listing dimmed in the background, with a bottom sheet open for filters. Same visual system.

Sheet title “Фільтри” and close button “Закрити”.
Groups, matching the desktop catalog:
“Ціна” from 200 to 5 000 грн.
“Вік” with “6–8 років” checked.
“Бренд”: LEGO, Cubika, Viga Toys.
“Наявність” with “В наявності” checked, plus “Закінчується” and “Очікується”.
“Кількість деталей”: “До 100”, “100–500”, “500+”.

The sheet body scrolls. A bar is fixed to the bottom of the screen: secondary “Скинути” and primary “Показати 128”. The primary button is on the right, easy to reach. Top radius matches the store cards. All copy in Ukrainian exactly as written.
```
