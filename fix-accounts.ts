import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fix() {
  try {
    const companies = await prisma.company.findMany();
    
    for (const company of companies) {
      console.log(`Checking company ${company.name} (${company.id})`);
      
      const requiredCodes = ['1010', '1020', '1100', '1200', '2200', '4010', '5010'];
      
      for (const code of requiredCodes) {
        const exists = await prisma.account.findFirst({
          where: { companyId: company.id, code }
        });
        
        if (!exists) {
          console.log(`Missing account ${code}. Creating...`);
          
          let name = '';
          let type = '';
          let subType = '';
          
          switch(code) {
            case '1010': name = 'Cash on Hand'; type = 'ASSET'; subType = 'CASH'; break;
            case '1020': name = 'Bank Accounts'; type = 'ASSET'; subType = 'BANK'; break;
            case '1100': name = 'Accounts Receivable'; type = 'ASSET'; subType = 'RECEIVABLE'; break;
            case '1200': name = 'Inventory'; type = 'ASSET'; subType = 'INVENTORY'; break;
            case '2200': name = 'GST / Sales Tax Payable'; type = 'LIABILITY'; subType = 'TAX'; break;
            case '4010': name = 'Sales Revenue'; type = 'REVENUE'; subType = 'SALES'; break;
            case '5010': name = 'Cost of Goods Sold'; type = 'EXPENSE'; subType = 'COGS'; break;
          }
          
          await prisma.account.create({
            data: {
              companyId: company.id,
              code,
              name,
              type,
              subType,
              isActive: true,
            }
          });
          console.log(`Created ${code} for ${company.name}`);
        }
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

fix();
