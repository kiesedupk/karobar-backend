import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCheckout() {
  const companyId = '03d7aad6-4281-4e26-a645-711ae889e334';
  
  try {
    const session = await prisma.posSession.findUnique({
      where: { id: "dc3c56e1-4747-40e4-828e-4206fa1484ce" },
      include: { warehouse: true }
    });
    console.log("Session found:", session ? "Yes" : "No");
    
    await prisma.$transaction(async (tx) => {
      const requiredCodes = ['1010', '1020', '1100', '1200', '2200', '4010', '5010'];
      const accounts = await tx.account.findMany({
        where: {
          companyId,
          code: { in: requiredCodes }
        }
      });
      console.log("Found accounts:", accounts.length);
      
      const getAcctId = async (code: string) => {
        const acct = accounts.find(a => a.code === code);
        if (acct) return acct.id;
        
        console.log(`Missing account ${code}, creating...`);
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
        
        const newAcct = await tx.account.create({
          data: { companyId, code, name, type, subType, isActive: true }
        });
        accounts.push(newAcct); // cache it
        return newAcct.id;
      };

      const cashAccountId = await getAcctId('1010');
      const bankAccountId = await getAcctId('1020'); 
      const arAccountId = await getAcctId('1100');
      const inventoryAccountId = await getAcctId('1200');
      const taxAccountId = await getAcctId('2200');
      const salesAccountId = await getAcctId('4010');
      const cogsAccountId = await getAcctId('5010');
      console.log("All accounts retrieved/created successfully.");
      
      // Simulate product find
      const productId = "fa2c05df-1608-4548-a3f9-4523dccb66f6";
      const product = await tx.product.findUnique({ where: { id: productId } });
      console.log("Product found:", product ? "Yes" : "No");
      
      throw new Error("Rollback intentionally to avoid polluting DB");
    });
  } catch (err) {
    console.error("Test Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

testCheckout();
