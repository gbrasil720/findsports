import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const waitlistRoleEnum = pgEnum("waitlist_role", ["fan", "pub"]);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: waitlistRoleEnum("role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
