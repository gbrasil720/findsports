import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const waitlistRoleEnum = pgEnum("waitlist_role", ["fan", "pub"]);

export const waitlistEntries = pgTable("waitlist_entries", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	phone: text("phone"),
	role: waitlistRoleEnum("role").notNull(),
	pubName: text("pub_name").notNull().default("N/A"),
	bairro: text("bairro").notNull().default("N/A"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
