import bcrypt from "bcryptjs";
import {readFileSync} from "fs";
import {join} from "path";
import {prisma} from "../src/database";
import {CardModel} from "../src/generated/prisma/models/Card";
import {PokemonType} from "../src/generated/prisma/enums";

/**
 * Cette fonction sert à Sélectionner aléatoirement n éléments d'un tableau
 */
function getRandomItems<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

async function main() {
    console.log("🌱 Starting database seed...");

    // Supprission des des DECK pour respecter les contraintes de clés étrangères
    await prisma.deckCard.deleteMany();
    await prisma.deck.deleteMany();
    await prisma.card.deleteMany();
    await prisma.user.deleteMany();

    const hashedPassword = await bcrypt.hash("password123", 10);

    await prisma.user.createMany({
        data: [
            {
                username: "red",
                email: "red@example.com",
                password: hashedPassword,
            },
            {
                username: "blue",
                email: "blue@example.com",
                password: hashedPassword,
            },
        ],
    });

    const redUser = await prisma.user.findUnique({where: {email: "red@example.com"}});
    const blueUser = await prisma.user.findUnique({where: {email: "blue@example.com"}});

    if (!redUser || !blueUser) {
        throw new Error("Failed to create users");
    }

    console.log("✅ Created users:", redUser.username, blueUser.username);

    const pokemonDataPath = join(__dirname, "data", "pokemon.json");
    const pokemonJson = readFileSync(pokemonDataPath, "utf-8");
    const pokemonData: CardModel[] = JSON.parse(pokemonJson);

    const createdCards = await Promise.all(
        pokemonData.map((pokemon) =>
            prisma.card.create({
                data: {
                    name: pokemon.name,
                    hp: pokemon.hp,
                    attack: pokemon.attack,
                    type: PokemonType[pokemon.type as keyof typeof PokemonType],
                    pokedexNumber: pokemon.pokedexNumber,
                    imgUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.pokedexNumber}.png`,
                },
            })
        )
    );

    console.log(`✅ Created ${pokemonData.length} Pokemon cards`);

    // Créer les decks de démarrage pour chaque utilisateur
    console.log("\n Creating starter decks...");

    // Sélectionner aléatoirement 10 cartes pour chaque deck
    const randomCardsForRed = getRandomItems(createdCards, 10);
    const randomCardsForBlue = getRandomItems(createdCards, 10);

    // Créer le deck pour l'utilisateur red
    const redDeck = await prisma.deck.create({
        data: {
            name: "Starter Deck",
            userId: redUser.id,
        },
    });

    // Créer les DeckCard pour le deck de red
    await prisma.deckCard.createMany({
        data: randomCardsForRed.map((card) => ({
            deckId: redDeck.id,
            cardId: card.id,
        })),
    });

    console.log(`Created "Starter Deck" for ${redUser.username} with ${randomCardsForRed.length} cards`);

    // Créer le deck pour l'utilisateur blue
    const blueDeck = await prisma.deck.create({
        data: {
            name: "Starter Deck",
            userId: blueUser.id,
        },
    });

    // Créer les DeckCard pour le deck de blue
    await prisma.deckCard.createMany({
        data: randomCardsForBlue.map((card) => ({
            deckId: blueDeck.id,
            cardId: card.id,
        })),
    });

    console.log(` Created "Starter Deck" for ${blueUser.username} with ${randomCardsForBlue.length} cards`);

    console.log("\n🎉 Database seeding completed!");
}

main()
    .catch((e) => {
        console.error("❌ Error seeding database:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
