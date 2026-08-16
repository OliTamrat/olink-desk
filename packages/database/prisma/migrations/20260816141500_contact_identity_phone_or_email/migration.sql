-- Contact identity becomes "at least one of phone or email".
--
-- The original rule was that a phone number IS the identity. That was right
-- while every channel was phone-first and wrong as a universal: an email
-- customer has no phone number, and their address is the only durable
-- identity they have.
--
-- Each stays unique WHEN PRESENT. Postgres permits any number of NULLs in a
-- unique index, which is precisely the semantics wanted: two contacts may both
-- have no email, but two contacts may not share one.
ALTER TABLE "Contact" ALTER COLUMN "phone" DROP NOT NULL;

CREATE UNIQUE INDEX "Contact_organizationId_email_key" ON "Contact"("organizationId", "email");
