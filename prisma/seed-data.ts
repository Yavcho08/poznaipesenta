// Данни за seed-а. За артист с несигурно съвпадение в Deezer — задай `deezerId` ръчно
// (seed скриптът показва кандидатите с линкове).

export interface SeedArtist {
  name: string;
  deezerId?: number;
}

export interface SeedGenre {
  slug: string;
  name: string;
  isPopFolk?: boolean;
  /** Чуждестранни артисти — без проверката за „български“ профил. */
  international?: boolean;
  artists: SeedArtist[];
}

const names = (...list: string[]): SeedArtist[] => list.map((name) => ({ name }));

export const GENRES: SeedGenre[] = [
  {
    slug: "pop-folk",
    name: "Поп-фолк",
    isPopFolk: true,
    artists: [
      { name: "Азис", deezerId: 356996 },
      { name: "Глория" },
      { name: "Преслава" },
      { name: "Галена" },
      // Андреа/Емилия/Анелия/Теодора: Deezer има чужди артисти със същото име — профилите са избрани
      // по известни песни („Докрай“, „Луд скандал“, „Запали“, „Фабрика за рани“).
      { name: "Андреа", deezerId: 58505 },
      { name: "Цветелина Янева" },
      { name: "Емилия", deezerId: 67156642 },
      { name: "Анелия", deezerId: 11979660 },
      { name: "Деси Слава" },
      { name: "Софи Маринова" },
      { name: "Камелия" },
      { name: "Джена" },
      { name: "Теодора", deezerId: 229810305 },
      // Избрани ръчно по известни песни (Deezer има няколко профила с тези имена).
      // Не „Деси Слава“ (11190584) — друга певица („Искам, но не мога“); имената дават еднакъв ключ.
      { name: "Десислава", deezerId: 201943 },
      { name: "Мирела", deezerId: 288757271 },
      { name: "Галин", deezerId: 11200218 },
      { name: "Ивана", deezerId: 817030 },
      { name: "Ани Хоанг", deezerId: 14241911 },
      { name: "Гергана", deezerId: 56772992 },
      { name: "Сиана", deezerId: 4027608 },
      { name: "Фики" },
      { name: "Малина" },
      ...names(
        "Симона",
        "Лидия",
        "Меди",
        "Константин",
        "Тони Стораро",
        "Алисия",
        "Емануела",
        "Крум",
        "Борис Дали",
        "Теди Александрова",
      ),
    ],
  },
  {
    slug: "pop",
    name: "Поп",
    artists: [
      { name: "Михаела Филева" },
      { name: "Мария Илиева" },
      { name: "Графа" },
      { name: "Миро" },
      { name: "Белослава" },
    ],
  },
  {
    slug: "rap",
    name: "Рап",
    artists: [{ name: "Криско" }, { name: "100 Кила" }, { name: "Устата" }, ],
  },
  {
    slug: "rock",
    name: "Рок",
    artists: [{ name: "Б.Т.Р." }, { name: "Щурците", deezerId: 10832960 }, { name: "Сигнал", deezerId: 85751 }, { name: "Ахат", deezerId: 6318902 }, { name: "Д2" }],
  },
  {
    slug: "rap-int",
    name: "Чуждестранен рап",
    international: true,
    artists: names(
      "Drake",
      "Yeat",
      "Don Toliver",
      "Travis Scott",
      "Kanye West",
      "Kendrick Lamar",
      "Future",
      "Playboi Carti",
      "21 Savage",
      "Lil Uzi Vert",
      "Ken Carson",
      "Lil Baby",
      "Young Thug",
      "Post Malone",
      "Central Cee",
      "J. Cole",
      "Eminem",
      "Metro Boomin",
    ),
  },
  {
    slug: "pop-int",
    name: "Чуждестранен поп",
    international: true,
    artists: names(
      "The Weeknd",
      "Dua Lipa",
      "Taylor Swift",
      "Billie Eilish",
      "Ed Sheeran",
      "Bruno Mars",
      "Rihanna",
      "Ariana Grande",
      "Justin Bieber",
      "Sabrina Carpenter",
      "Lady Gaga",
      "Bad Bunny",
    ),
  },
];

/** Curated поп-фолк плейлисти по десетилетия (по годината на издаване в Deezer). */
export const POP_FOLK_DECADES = [
  { name: "Поп-фолк класики (90-те и 2000-те)", description: "Хитовете, с които всичко започна", from: 1900, to: 2009 },
  { name: "Поп-фолк 2010-те", description: "Хитовете на десетилетието", from: 2010, to: 2019 },
  { name: "Нов поп-фолк", description: "От 2020 г. насам", from: 2020, to: 2100 },
];
