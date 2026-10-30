-- Kanbans de Compras e Operações Full agora só têm o modo tela cheia; a
-- preferência por organização deixou de existir.
ALTER TABLE "kanban_board_settings" DROP COLUMN "is_fullscreen";
