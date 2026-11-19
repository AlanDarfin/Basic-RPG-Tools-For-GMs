# Basic RPG

Calendário de fantasia e cronologia de campanha para Obsidian. É um projeto companheiro do Basic, mas tem instalação e dados próprios. Funciona sem conta, serviço externo ou outro plugin.

## O que dá para fazer

- Criar vários calendários no mesmo cofre, alternar entre eles e duplicar uma configuração para outra campanha.
- Definir nomes e ordem dos meses, duração, tamanho da semana, continuidade entre meses, dias especiais, meses intercalados e regras de ano bissexto.
- Criar eras com numeração própria, estações por data ou duração, luas com ciclos independentes e relógios fictícios.
- Configurar até oito sóis por mundo, com tamanho, cor, órbita, inclinação, fase inicial e latitude do observador. Simular o céu de qualquer data e horário.
- Consultar os dias em grade ou lista, com atalhos junto do mês, numeração alinhada e lista agrupada por semana. Ver o dia selecionado sem chegar ao fim do mês.
- Usar o relógio do mundo em tempo real, com avanço calculado mesmo quando o Obsidian fica fechado, ou manter o calendário no modo manual.
- Calcular eclipses solares e lunares e encontrar o próximo pico no calendário.
- Criar eventos pontuais, de vários dias, anuais ou ligados ao início de uma estação. Vincular notas de sessão, colorir, categorizar e marcar eventos como reservados.
- Navegar pela cronologia de um ano com filtros de categoria e de eventos reservados. Para eventos de vários dias, a lista mostra a primeira data no ano em exibição.
- Importar JSON do Fantasy Calendar e salvar backups próprios do calendário ativo dentro do cofre.

## Primeiro uso

Abra o ícone de calendário do Basic RPG na faixa lateral ou use a paleta de comandos. A ação **Abrir calendário na área principal** dá mais espaço para a grade. Em painéis estreitos, **Automático** troca a grade por lista. Use os ícones de **grade** e **lista** ao lado do título do mês pra alternar o formato. Toque de novo no formato ativo pra voltar ao automático. Use **Calendários** na barra superior para alternar ou editar um mundo.

O preset **Arkanis** vem pronto, começando em **1 de Arkanis, ano 1, às 00:00**. Ele tem 26 meses, incluindo Skaryel, semanas de 12 dias, quatro estações, três luas, três sóis e o relógio de 32 horas por dia, com 64 minutos por hora. Os botões de avançar e voltar mudam a data do mundo. As setas próximas ao seletor de mês só navegam pela visualização.

Para criar outro calendário, use **Novo calendário** na barra ou **Configurações → Basic RPG → Novo calendário**. O editor visual tem seções para semana e relógio, meses, dias especiais, luas, estações e eras. Dias especiais entram ao final de um mês e podem ficar fora da contagem semanal. Para um dia que ocorre a cada quatro anos, exceto nos múltiplos de 100 e restaurado nos múltiplos de 400, informe **4**, **100** e **400** na regra. A contagem começa no ano 1.

Para um evento de sessão, selecione a data e clique em **Novo evento**. Escolha uma nota existente para abrir a sessão diretamente pelo calendário. Eventos marcados como reservados somem da visualização padrão, mas continuam no cofre e no backup. Isso é um filtro de interface, não uma permissão de acesso.

## Relógio em tempo real

Ao abrir pela primeira vez, ou ao atualizar um calendário que ainda não tem uma configuração de relógio, o Basic RPG ativa **Tempo real** usando a data e a hora que já estavam salvas. Cada **24 horas reais equivalem a um dia completo do mundo**, seja qual for a duração do dia fictício.

O plugin guarda o horário real de referência. Fechar o Obsidian não congela a campanha. Ao reabrir, o Basic RPG calcula quantos dias e minutos passaram, sem serviços externos e sem executar nada em segundo plano. Os eventos salvos continuam na mesma data.

Use **Definir data e hora do mundo** para ajustar a data, alinhar a hora à posição no dia real do aparelho ou mudar para **Manual**. O modo manual pausa o avanço a partir da hora mostrada. O alinhamento preserva a data que você selecionou, por exemplo, meio-dia local vira **16:00 em Arkanis**. Alterar o tamanho do dia sem informar outra hora mantém a mesma proporção do dia do mundo.

## Céu e sóis

Abra **Céu** ou escolha o ícone solar em **Dia em foco**. Os discos dos sóis mostram cor, tamanho relativo e estado de visibilidade. As luas têm discos próprios com a fase e a porcentagem iluminada na hora observada. Em **Horários e órbitas dos sóis**, a faixa de cada sol mostra quando ele fica acima do horizonte. A linha indica a hora em consulta.

No dia atual, **Hora do mundo** acompanha o relógio. Mover o controle deslizante, digitar `HH:MM` ou escolher **Meio-dia** fixa uma prévia sem mexer no relógio da campanha. Use **Hora do mundo** pra voltar à observação ao vivo.

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
