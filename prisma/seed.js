const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const shop = await prisma.location.upsert({
    where: { name: "Main Storage" },
    update: {},
    create: {
      name: "Main Storage",
      type: "storage",
      healthScore: 95
    }
  });

  await prisma.user.upsert({
    where: { email: "demo@gearpin.local" },
    update: {},
    create: {
      name: "Demo Tech",
      email: "demo@gearpin.local"
    }
  });

  const items = [
    {
      assetTag: "GP-AUDIO-001",
      name: "Shure SM58 Kit",
      category: "Audio",
      manufacturer: "Shure",
      model: "SM58",
      homeLocationId: shop.id
    },
    {
      assetTag: "GP-VIDEO-001",
      name: "Blackmagic SDI Converter",
      category: "Video",
      manufacturer: "Blackmagic Design",
      model: "Micro Converter",
      homeLocationId: shop.id
    }
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { assetTag: item.assetTag },
      update: {},
      create: item
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
