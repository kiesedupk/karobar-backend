import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting FIFO Layer Migration for existing stock...');

  // 1. Get all warehouse stocks that are > 0
  const stocks = await prisma.warehouseStock.findMany({
    where: { quantity: { gt: 0 } },
    include: { product: true },
  });

  console.log(`Found ${stocks.length} warehouse stock records with positive quantity.`);

  let createdCount = 0;

  for (const stock of stocks) {
    const { companyId, warehouseId, productId, quantity, product } = stock;

    // Check if a layer already exists for this stock
    const existingLayers = await prisma.inventoryFifoLayer.findMany({
      where: {
        companyId,
        warehouseId,
        productId,
      },
    });

    if (existingLayers.length > 0) {
      console.log(`Skipping product ${product.name} in warehouse ${warehouseId} - FIFO layer already exists.`);
      continue;
    }

    // Determine cost price (fallback to 0 if not set)
    const costPrice = product.costPrice ? Number(product.costPrice) : 0;

    // Create opening layer
    await prisma.inventoryFifoLayer.create({
      data: {
        companyId,
        warehouseId,
        productId,
        unitCost: costPrice,
        originalQty: quantity,
        remainingQty: quantity,
        sourceType: 'OPENING',
        sourceId: 'MIGRATION_SCRIPT',
      },
    });

    createdCount++;
    console.log(`Created FIFO layer for ${product.name} (Qty: ${quantity}, Cost: ${costPrice})`);
  }

  console.log(`\nMigration completed successfully. Created ${createdCount} FIFO layers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
