import { PrismaClient } from "@prisma/client";
import { hashPassword, validatePasswordLength } from "../lib/server/auth/password";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || "admin@demo.local").trim().toLowerCase();
  const name = (process.env.INITIAL_ADMIN_NAME || "ERP Administrator").trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD || "";

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, passwordHash: true },
  });

  if (existing?.passwordHash) {
    console.log(`Authentication is configured for ${email}.`);
    return;
  }

  if (!password) {
    throw new Error(
      "INITIAL_ADMIN_PASSWORD is required until the first administrator password has been created.",
    );
  }

  validatePasswordLength(password);
  const passwordHash = await hashPassword(password);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        name,
        role: "ADMIN",
        active: true,
        passwordHash,
      },
    });
    console.log(`Configured administrator login for ${email}.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name,
        role: "ADMIN",
        active: true,
        passwordHash,
      },
    });
    console.log(`Created the initial administrator login for ${email}.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
