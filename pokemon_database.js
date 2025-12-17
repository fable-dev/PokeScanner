// pokemon_database.js

// This database links a Pokémon Species to the "Candy" text found on screen.
// maxCP is set to roughly Level 50/51 values to be safe.

const POKEMON_DATA = [
    // === CHARMANDER FAMILY ===
    { id: "charmander", name: "Charmander", family: "Charmander", maxCP: 1150 },
    { id: "charmeleon", name: "Charmeleon", family: "Charmander", maxCP: 1950 },
    { id: "charizard", name: "Charizard", family: "Charmander", maxCP: 3300 }, // Mega is higher, but base is ~3300

    // === GIBLE FAMILY ===
    { id: "gible", name: "Gible", family: "Gible", maxCP: 1300 },
    { id: "gabite", name: "Gabite", family: "Gible", maxCP: 2000 },
    { id: "garchomp", name: "Garchomp", family: "Gible", maxCP: 4500 },

    // === DRATINI FAMILY ===
    { id: "dratini", name: "Dratini", family: "Dratini", maxCP: 1200 },
    { id: "dragonair", name: "Dragonair", family: "Dratini", maxCP: 2100 },
    { id: "dragonite", name: "Dragonite", family: "Dratini", maxCP: 4300 },

    // === BELDUM FAMILY (Metagross) ===
    { id: "beldum", name: "Beldum", family: "Beldum", maxCP: 1100 },
    { id: "metang", name: "Metang", family: "Beldum", maxCP: 2000 },
    { id: "metagross", name: "Metagross", family: "Beldum", maxCP: 4300 },

    // === SLAKOTH FAMILY (Slaking) ===
    { id: "slakoth", name: "Slakoth", family: "Slakoth", maxCP: 1200 },
    { id: "vigoroth", name: "Vigoroth", family: "Slakoth", maxCP: 2250 },
    { id: "slaking", name: "Slaking", family: "Slakoth", maxCP: 5050 }, // Massive CP!

    // === SCATTERBUG FAMILY ===
    { id: "scatterbug", name: "Scatterbug", family: "Scatterbug", maxCP: 600 },
    { id: "spewpa", name: "Spewpa", family: "Scatterbug", maxCP: 850 },
    { id: "vivillon", name: "Vivillon", family: "Scatterbug", maxCP: 2100 },

    // === LEGENDARIES (Usually have their own Candy) ===
    { id: "rayquaza", name: "Rayquaza", family: "Rayquaza", maxCP: 4400 },
    { id: "necrozma", name: "Necrozma", family: "Necrozma", maxCP: 4600 }, // Base forms
    { id: "kyogre", name: "Kyogre", family: "Kyogre", maxCP: 4700 },
    { id: "groudon", name: "Groudon", family: "Groudon", maxCP: 4700 },
    { id: "mewtwo", name: "Mewtwo", family: "Mewtwo", maxCP: 4800 },
    { id: "lugia", name: "Lugia", family: "Lugia", maxCP: 4200 },
    { id: "ho-oh", name: "Ho-Oh", family: "Ho-Oh", maxCP: 4400 },
    { id: "dialga", name: "Dialga", family: "Dialga", maxCP: 4600 },
    { id: "palkia", name: "Palkia", family: "Palkia", maxCP: 4600 },
    { id: "giratina", name: "Giratina", family: "Giratina", maxCP: 4200 },
    { id: "reshiram", name: "Reshiram", family: "Reshiram", maxCP: 4600 },
    { id: "zekrom", name: "Zekrom", family: "Zekrom", maxCP: 4600 },
    { id: "kyurem", name: "Kyurem", family: "Kyurem", maxCP: 4100 },
    { id: "xerneas", name: "Xerneas", family: "Xerneas", maxCP: 4300 },
    { id: "yveltal", name: "Yveltal", family: "Yveltal", maxCP: 4300 },
    { id: "solgaleo", name: "Solgaleo", family: "Cosmog", maxCP: 4600 }, // Cosmog Candy
    { id: "lunala", name: "Lunala", family: "Cosmog", maxCP: 4600 }
];
