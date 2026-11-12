-- WEB-529: regras de clássico v2 (decisão do dono, 12/11/2026). Só dados.
-- A versão ativa é a maior (`currentClassicRulesCte`); a v1 fica intacta para
-- a classificação histórica. Sai Flamengo x Palmeiras; entram Majestoso,
-- San-São, Corinthians x Santos, Ba-Vi, Vasco x Botafogo, Flamengo x
-- Botafogo, Vasco x Fluminense, Atletiba, Clássico-Rei e Sport x Santa Cruz.
-- Slugs conferidos contra `slugify` dos nomes do catálogo (futebol.json).
INSERT INTO "classic_rule_version" ("id", "version", "created_at")
VALUES ('classic-v2', 2, NOW())
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "classic_rule" (
	"id", "rule_version_id", "rule_type", "team_a_slug", "team_b_slug", "reason"
)
VALUES
	('classic-v2-flamengo-vasco', 'classic-v2', 'team_pair', 'flamengo', 'vasco', 'Flamengo x Vasco: Clássico dos Milhões'),
	('classic-v2-flamengo-fluminense', 'classic-v2', 'team_pair', 'flamengo', 'fluminense', 'Flamengo x Fluminense: Fla-Flu'),
	('classic-v2-corinthians-palmeiras', 'classic-v2', 'team_pair', 'corinthians', 'palmeiras', 'Corinthians x Palmeiras: Derby'),
	('classic-v2-sao-paulo-palmeiras', 'classic-v2', 'team_pair', 'sao-paulo', 'palmeiras', 'São Paulo x Palmeiras: Choque-Rei'),
	('classic-v2-gremio-internacional', 'classic-v2', 'team_pair', 'gremio', 'internacional', 'Grêmio x Internacional: Grenal'),
	('classic-v2-atletico-mg-cruzeiro', 'classic-v2', 'team_pair', 'atletico-mg', 'cruzeiro', 'Atlético-MG x Cruzeiro: Clássico Mineiro'),
	('classic-v2-botafogo-fluminense', 'classic-v2', 'team_pair', 'botafogo', 'fluminense', 'Botafogo x Fluminense: Clássico Vovô'),
	('classic-v2-corinthians-sao-paulo', 'classic-v2', 'team_pair', 'corinthians', 'sao-paulo', 'Corinthians x São Paulo: Majestoso'),
	('classic-v2-santos-sao-paulo', 'classic-v2', 'team_pair', 'santos', 'sao-paulo', 'Santos x São Paulo: San-São'),
	('classic-v2-corinthians-santos', 'classic-v2', 'team_pair', 'corinthians', 'santos', 'Corinthians x Santos: Clássico Alvinegro'),
	('classic-v2-bahia-vitoria', 'classic-v2', 'team_pair', 'bahia', 'vitoria', 'Bahia x Vitória: Ba-Vi'),
	('classic-v2-vasco-botafogo', 'classic-v2', 'team_pair', 'vasco', 'botafogo', 'Vasco x Botafogo: Clássico da Amizade'),
	('classic-v2-flamengo-botafogo', 'classic-v2', 'team_pair', 'flamengo', 'botafogo', 'Flamengo x Botafogo: Clássico da Rivalidade'),
	('classic-v2-vasco-fluminense', 'classic-v2', 'team_pair', 'vasco', 'fluminense', 'Vasco x Fluminense: Clássico dos Gigantes'),
	('classic-v2-athletico-pr-coritiba', 'classic-v2', 'team_pair', 'athletico-pr', 'coritiba', 'Athletico-PR x Coritiba: Atletiba'),
	('classic-v2-ceara-fortaleza', 'classic-v2', 'team_pair', 'ceara', 'fortaleza', 'Ceará x Fortaleza: Clássico-Rei'),
	('classic-v2-sport-santa-cruz', 'classic-v2', 'team_pair', 'sport', 'santa-cruz', 'Sport x Santa Cruz: Clássico das Multidões')
ON CONFLICT DO NOTHING;
