# Basic RPG

Calendário de fantasia e cronologia de campanha para Obsidian. É um projeto companheiro do Basic, mas tem instalação e dados próprios. Funciona sem conta, serviço externo ou outro plugin.

## O que dá para fazer

- Criar vários calendários no mesmo cofre, alternar entre eles e duplicar uma configuração para outra campanha.
- Definir nomes e ordem dos meses, duração, tamanho da semana, continuidade entre meses, dias especiais, meses intercalados e regras de ano bissexto.
- Criar eras com numeração própria, estações por data ou duração, luas com ciclos independentes e relógios fictícios.
- Configurar até oito sóis por mundo, com tamanho, cor, órbita, inclinação, fase inicial e latitude do observador. Simular o céu de qualquer data e horário.
- Consultar os dias em grade ou lista e ver o dia selecionado sem chegar ao fim do mês. Navegar na previsão sem mover o relógio da campanha e avançar ou voltar a data atual quando quiser.
- Calcular eclipses solares e lunares e encontrar o próximo pico no calendário.
- Criar eventos pontuais, de vários dias, anuais ou ligados ao início de uma estação. Vincular notas de sessão, colorir, categorizar e marcar eventos como reservados.
- Navegar pela cronologia de um ano com filtros de categoria e de eventos reservados. Para eventos de vários dias, a lista mostra a primeira data no ano em exibição.
- Importar JSON do Fantasy Calendar e salvar backups próprios do calendário ativo dentro do cofre.

## Primeiro uso

Abra o ícone de calendário do Basic RPG na faixa lateral ou use a paleta de comandos. A ação **Abrir calendário na área principal** dá mais espaço para a grade. Em painéis estreitos, **Automático** troca a grade por lista. Em **Exibição e filtros**, você também pode escolher o formato manualmente. Use **Calendários** na barra superior para alternar ou editar um mundo.

O preset **Arkanis** vem pronto, começando em **1 de Arkanis, ano 1, às 00:00**. Ele tem 26 meses, incluindo Skaryel, semanas de 12 dias, quatro estações, três luas, três sóis e o relógio de 32 horas por dia, com 64 minutos por hora. Os botões de avançar e voltar mudam a data do mundo. As setas próximas ao seletor de mês só navegam pela visualização.

Para criar outro calendário, use **Novo calendário** na barra ou **Configurações → Basic RPG → Novo calendário**. O editor visual tem seções para semana e relógio, meses, dias especiais, luas, estações e eras. Dias especiais entram ao final de um mês e podem ficar fora da contagem semanal. Para um dia que ocorre a cada quatro anos, exceto nos múltiplos de 100 e restaurado nos múltiplos de 400, informe **4**, **100** e **400** na regra. A contagem começa no ano 1.

Para um evento de sessão, selecione a data e clique em **Novo evento**. Escolha uma nota existente para abrir a sessão diretamente pelo calendário. Eventos marcados como reservados somem da visualização padrão, mas continuam no cofre e no backup. Isso é um filtro de interface, não uma permissão de acesso.

## Céu e sóis

Abra **Céu** ou escolha o ícone solar em **Dia em foco**. A aba mostra quais sóis chegam acima do horizonte naquele dia, quais estão visíveis na hora simulada e seus horários de nascer e pôr. Cada faixa representa os intervalos visíveis em relação às horas do dia. A posição da linha indica a hora em consulta. Mude a hora pelo controle deslizante ou por `HH:MM`. A simulação não altera a data ou a hora da campanha.

O preset Arkanis usa **Innart, Dinart e Reart**. Reart é a referência, chega ao ponto mais alto às **16:00** e nasce em todos os dias. Há dias em que Innart ou Dinart não nascem e dias com sobreposição. O cálculo usa órbitas circulares independentes, com período proporcional ao semieixo elevado a 3/2. É uma aproximação para um céu fictício, sem interação gravitacional entre as três estrelas. [Referência de órbitas e gravidade](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/).

Em **Céu → Configurar sóis**, edite a latitude, o período da órbita de referência e os parâmetros de cada sol. A latitude e a inclinação do sol de referência precisam permitir que ele nasça em qualquer dia. Calendários antigos com o preset Arkanis ganham o modelo solar sem perder datas nem eventos. Outros mundos começam com o céu vazio.

## Eclipses

Abra **Céu → Eclipses**. O painel mostra quando começa, o máximo, o fim e como está o horizonte no máximo. O controle de hora marca quando o alinhamento está em curso na simulação, mesmo se ele ocorrer abaixo do horizonte. A previsão indica também quando o evento continua no dia seguinte. **Próximo eclipse** procura o próximo pico após a data selecionada, até 366 dias, e abre a previsão na hora daquele pico. A consulta não muda a data da campanha e não cria eventos no cofre.

O Basic RPG diferencia eclipses solares **totais**, **parciais** e **anulares** e lunares **totais**, **parciais** e **penumbrais**. Eclipses solares são calculados para cada par lua–sol. Um eclipse lunar representa a sombra do planeta em relação a um dos sóis. Se houver outros, ainda podem iluminar a lua.

Em **Editar calendário → Luas → Órbita e eclipses**, você pode ajustar a inclinação, o nó ascendente, o raio aparente da lua e o raio da sombra. Luas ocultas não entram na previsão. O modelo usa discos angulares e um plano lunar circular, com a direção solar fixa ao longo de cada dia. Não simula paralaxe, mapas de sombra nem a interação gravitacional entre os corpos. É uma previsão para mundos fictícios. [Referência de geometria dos eclipses](https://science.nasa.gov/eclipses/geometry/).

## Importação e backup

Em **Configurações → Basic RPG**, use **Importar JSON**. Cada importação vira um novo calendário, sem sobrescrever os existentes.

O importador aceita a estrutura usada pelo calendário de Arkanis e configurações semelhantes do Fantasy Calendar, com meses anuais, semana global, dias especiais no fim do mês, estações, luas e eventos pontuais ou de início de estação. Quando encontra uma regra avançada de evento que não consegue representar, lista o evento não importado. Se a regra incompatível altera a estrutura de datas, o importador rejeita o arquivo em vez de mover as datas silenciosamente. Clima e dados de localização não são importados. O Fantasy Calendar não carrega o modelo solar do Basic RPG. O importador aplica o céu padrão se reconhecer o calendário de Arkanis. O JSON exportado é um backup no formato **Basic RPG**, não um arquivo de exportação do Fantasy Calendar nem um backup nativo do Calendarium.

A função **Salvar JSON no cofre** gera um novo arquivo, incluindo os sóis e as órbitas lunares editadas, sem substituir backups anteriores. Os eventos armazenados também podem ser sincronizados como dados do plugin pelo mecanismo de sincronização do cofre, quando configurado no Obsidian.

## Instalação manual

1. Crie a pasta `.obsidian/plugins/basic-rpg/` no cofre.
2. Copie os arquivos [`manifest.json`](manifest.json), [`main.js`](main.js) e [`styles.css`](styles.css) da raiz deste repositório para essa pasta.
3. Reabra o cofre ou recarregue o aplicativo e ative **Basic RPG** em **Plugins da comunidade**.

Compatibilidade declarada a partir do Obsidian 1.7.2. O plugin não usa APIs de Node.js no aplicativo e foi projetado para desktop e Android. A instalação manual no Android requer que a pasta do plugin seja acessível pelo gerenciador de arquivos ou pela sincronização do seu cofre.

## Desenvolvimento

Com Node.js 20 ou superior, não é necessário instalar dependências para compilar ou rodar os testes:

```sh
npm run build
npm test
```

O código-fonte fica em `src/`. O arquivo `main.js` é gerado a partir dele e pode ser copiado direto para a pasta do plugin.

O Basic RPG é uma implementação independente inspirada no [Calendarium](https://github.com/javalent/calendarium), de Javalent. O preset Arkanis usa os dados do [Arkanis Calendar](https://github.com/AlanDarfin/Arkanis-Calendar).
