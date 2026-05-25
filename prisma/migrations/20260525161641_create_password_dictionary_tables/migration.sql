-- CreateTable
CREATE TABLE "password_dictionaries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'common',
    "entry_count" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_dictionaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_passwords" (
    "id" SERIAL NOT NULL,
    "dictionary_id" INTEGER NOT NULL,
    "password" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "has_digits" BOOLEAN NOT NULL DEFAULT false,
    "has_special" BOOLEAN NOT NULL DEFAULT false,
    "has_upper" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dictionary_passwords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_dictionaries_user_id_idx" ON "password_dictionaries"("user_id");

-- CreateIndex
CREATE INDEX "password_dictionaries_category_idx" ON "password_dictionaries"("category");

-- CreateIndex
CREATE INDEX "dictionary_passwords_password_idx" ON "dictionary_passwords"("password");

-- CreateIndex
CREATE INDEX "dictionary_passwords_dictionary_id_idx" ON "dictionary_passwords"("dictionary_id");

-- CreateIndex
CREATE INDEX "dictionary_passwords_length_idx" ON "dictionary_passwords"("length");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_passwords_dictionary_id_password_key" ON "dictionary_passwords"("dictionary_id", "password");

-- AddForeignKey
ALTER TABLE "password_dictionaries" ADD CONSTRAINT "password_dictionaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_passwords" ADD CONSTRAINT "dictionary_passwords_dictionary_id_fkey" FOREIGN KEY ("dictionary_id") REFERENCES "password_dictionaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
