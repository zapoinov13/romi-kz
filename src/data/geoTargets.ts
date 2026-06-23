/**
 * География для запуска Meta-кампаний.
 * Города — только с населением > 200 000 человек.
 * country_code соответствует Meta Marketing API (ISO-3166-1 alpha-2),
 * city_key — внутренний ключ (для удобства), при отправке передаём
 * country_code + название города (n8n матчит через targeting search).
 */

export interface GeoCity {
  key: string;
  name: string;
  /** Население, тыс. */
  population: number;
}

export interface GeoCountry {
  code: string; // ISO alpha-2 (для Meta targeting)
  name: string;
  cities: GeoCity[];
}

export const GEO_COUNTRIES: GeoCountry[] = [
  {
    code: "BY",
    name: "Беларусь",
    cities: [
      { key: "minsk", name: "Минск", population: 1996 },
      { key: "gomel", name: "Гомель", population: 502 },
      { key: "mogilev", name: "Могилёв", population: 357 },
      { key: "vitebsk", name: "Витебск", population: 360 },
      { key: "grodno", name: "Гродно", population: 357 },
      { key: "brest", name: "Брест", population: 339 },
      { key: "bobruisk", name: "Бобруйск", population: 209 },
    ],
  },
  {
    code: "UA",
    name: "Украина",
    cities: [
      { key: "kyiv", name: "Киев", population: 2952 },
      { key: "kharkiv", name: "Харьков", population: 1421 },
      { key: "odesa", name: "Одесса", population: 1010 },
      { key: "dnipro", name: "Днепр", population: 968 },
      { key: "lviv", name: "Львов", population: 717 },
      { key: "zaporizhzhia", name: "Запорожье", population: 710 },
      { key: "kryvyi-rih", name: "Кривой Рог", population: 612 },
      { key: "mykolaiv", name: "Николаев", population: 470 },
      { key: "vinnytsia", name: "Винница", population: 370 },
      { key: "kherson", name: "Херсон", population: 283 },
      { key: "poltava", name: "Полтава", population: 282 },
      { key: "chernihiv", name: "Чернигов", population: 280 },
      { key: "cherkasy", name: "Черкассы", population: 270 },
      { key: "sumy", name: "Сумы", population: 256 },
      { key: "zhytomyr", name: "Житомир", population: 261 },
      { key: "khmelnytskyi", name: "Хмельницкий", population: 274 },
      { key: "chernivtsi", name: "Черновцы", population: 264 },
      { key: "rivne", name: "Ровно", population: 245 },
      { key: "ivano-frankivsk", name: "Ивано-Франковск", population: 238 },
      { key: "kropyvnytskyi", name: "Кропивницкий", population: 224 },
      { key: "ternopil", name: "Тернополь", population: 217 },
      { key: "lutsk", name: "Луцк", population: 217 },
      { key: "kremenchuk", name: "Кременчуг", population: 217 },
      { key: "bila-tserkva", name: "Белая Церковь", population: 208 },
    ],
  },
  {
    code: "KZ",
    name: "Казахстан",
    cities: [
      { key: "almaty", name: "Алматы", population: 2228 },
      { key: "astana", name: "Астана", population: 1466 },
      { key: "shymkent", name: "Шымкент", population: 1219 },
      { key: "karagandy", name: "Караганда", population: 503 },
      { key: "aktobe", name: "Актобе", population: 543 },
      { key: "taraz", name: "Тараз", population: 408 },
      { key: "pavlodar", name: "Павлодар", population: 365 },
      { key: "ust-kamenogorsk", name: "Усть-Каменогорск", population: 333 },
      { key: "semey", name: "Семей", population: 358 },
      { key: "atyrau", name: "Атырау", population: 367 },
      { key: "kostanay", name: "Костанай", population: 252 },
      { key: "kyzylorda", name: "Кызылорда", population: 263 },
      { key: "uralsk", name: "Уральск", population: 263 },
      { key: "petropavl", name: "Петропавловск", population: 219 },
      { key: "aktau", name: "Актау", population: 230 },
      { key: "temirtau", name: "Темиртау", population: 215 },
      { key: "turkistan", name: "Туркестан", population: 240 },
      { key: "kokshetau", name: "Кокшетау", population: 200 },
    ],
  },
  {
    code: "AE",
    name: "ОАЭ (Дубай)",
    cities: [
      { key: "dubai", name: "Дубай", population: 3604 },
      { key: "abu-dhabi", name: "Абу-Даби", population: 1483 },
      { key: "sharjah", name: "Шарджа", population: 1684 },
      { key: "al-ain", name: "Аль-Айн", population: 766 },
      { key: "ajman", name: "Аджман", population: 540 },
      { key: "ras-al-khaimah", name: "Рас-эль-Хайма", population: 351 },
    ],
  },
];

export function findCountry(code: string): GeoCountry | undefined {
  return GEO_COUNTRIES.find((c) => c.code === code);
}
