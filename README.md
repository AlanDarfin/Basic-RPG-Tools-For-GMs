# Basic RPG

Calendário de fantasia, cronologia de campanha e ferramentas para RPG solo no Obsidian. É um projeto companheiro do Basic, mas tem instalação e dados próprios. Funciona sem conta, serviço externo ou outro plugin.

## O que dá para fazer

- Criar vários calendários no mesmo cofre, alternar entre eles e duplicar uma configuração para outra campanha.
- Definir nomes e ordem dos meses, duração, tamanho da semana, continuidade entre meses, dias especiais, meses intercalados e regras de ano bissexto.
- Criar eras com numeração própria, estações por data ou duração, luas com ciclos independentes e relógios fictícios.
- Configurar até oito sóis por mundo, com tamanho, cor, órbita, inclinação, fase inicial e latitude do observador. Simular o céu de qualquer data e horário.
- Consultar os dias em grade ou lista, com atalhos junto do mês, numeração alinhada e lista agrupada por semana. Ver o dia selecionado sem chegar ao fim do mês.
- Usar o relógio do mundo em tempo real, com avanço calculado mesmo quando o Obsidian fica fechado, ou manter o calendário no modo manual.
- Calcular eclipses solares e lunares e encontrar o próximo pico no calendário.
- Criar eventos pontuais, de vários dias, anuais ou ligados ao início de uma estação. Vincular notas de sessão, colorir, categorizar e marcar eventos como reservados.
- Navegar pela cronologia de um ano, agrupada por mês e dia, com filtros de mês, categoria e eventos reservados. Toque na data para abrir o dia no calendário, ou no evento para ver os detalhes e ações. Para eventos de vários dias, a lista mostra a primeira data no ano em exibição.
- Acompanhar a estação atual, o progresso e a próxima virada. Marcar inícios de estação no calendário e comparar o clima de cada trecho do ciclo.
- Simular temperatura, vento, rajadas, neblina, umidade, cobertura de nuvens e precipitação em diferentes regiões e estações.
- Consultar o ano, a agenda dos próximos 30 dias e os eventos sem data.
- Criar recorrências por intervalo e condições, com prévia de ocorrências e categorias padrão.
- Gerar eventos das notas, inserir a data do mundo e mostrar calendário, agenda ou clima em blocos Markdown.
- Importar calendários do Fantasy Calendar e do Calendarium, exportar JSON compatível com o Fantasy Calendar e salvar backups nativos ou um resumo para jogadores.
- Jogar com dados e baralhos personalizados, oráculos, geradores de ideias, tabelas e fichas interativas no Markdown.

## Primeiro uso

Abra o ícone de calendário do Basic RPG na faixa lateral ou use a paleta de comandos. A ação **Abrir calendário na área principal** dá mais espaço para a grade. Em painéis estreitos, **Automático** troca a grade por lista. Use os ícones de **grade** e **lista** ao lado do título do mês pra alternar o formato. Toque de novo no formato ativo pra voltar ao automático. Use **Calendários** na barra superior para alternar ou editar um mundo.

O preset **Arkanis** vem pronto, começando em **1 de Arkanis, ano 1, às 00:00**. Ele tem 26 meses, incluindo Skaryel, semanas de 12 dias, quatro estações, três luas, três sóis e o relógio de 32 horas por dia, com 64 minutos por hora. Os botões de avançar e voltar mudam a data do mundo. As setas próximas ao seletor de mês só navegam pela visualização.

Para criar outro calendário, use **Novo calendário** na barra ou **Configurações → Basic RPG → Novo calendário**. O editor visual tem seções para semana e relógio, meses, dias especiais, luas, sóis, estações, clima e eras. Você pode dar uma semana própria a um mês, fazer um mês aparecer só em alguns anos ou inserir dias especiais em qualquer posição. Dias intercalados não consomem a semana. Para um dia que ocorre a cada quatro anos, exceto nos múltiplos de 100 e restaurado nos múltiplos de 400, informe **4**, **100** e **400** na regra. A contagem começa no ano 1.

Para um evento de sessão, selecione a data e clique em **Novo evento**. Escolha uma nota existente para abrir a sessão diretamente pelo calendário. Eventos marcados como reservados somem da visualização padrão, mas continuam no cofre e no backup. Isso é um filtro de interface, não uma permissão de acesso.

## Kit solo

Abra **Basic RPG · Abrir kit solo** na paleta de comandos ou toque no ícone de dados na faixa lateral. Também há um atalho no menu **Calendários**. Use **Abrir kit solo na área principal** para ganhar espaço no celular.

### Dados

- A rolagem rápida inclui d4, d6, d8, d10, d12, d20, d100 e dF. Informe a quantidade ou digite uma expressão como `2d20+3/a` para vantagem, `2d20/d` para desvantagem ou `4dF` para Fate/Fudge. Separe as rolagens em dois grupos e veja os totais de cada grupo.
- Em **Novo dado**, escolha de **2 a 1.000 faces**. Cada face pode ser um número, texto, emoji/símbolo ou uma imagem. Toque no ícone de imagem para pegar um arquivo do cofre. Faces repetidas aumentam a chance de aquele resultado sair. Uma rolagem só mostra soma se todas as faces sorteadas forem numéricas.
- Você pode copiar os resultados ou inseri-los na nota. Imagens do cofre aparecem sem internet. Para usar URLs HTTP(S), ative **Imagens por URL** nas preferências do Kit solo.

### Baralhos

O kit vem com um baralho de 52 cartas, com dois coringas opcionais, e um tarô de **22 Arcanos Maiores** com símbolos e palavras-chave em português. Escolha quantas cartas comprar, devolva uma carta ao monte ou reembaralhe a seção. O plugin guarda as compras entre sessões e não repõe cartas até você devolvê-las. As orientações são independentes do nome da carta.

**Novo baralho** abre o editor de cartas. Você pode adicionar frente e verso, descrição, tipo, elemento, custo, nível, ataque e defesa. Organize cartas em **Principal**, **Extra** e **Reserva**. Cada seção tem seu próprio monte. Abra **Catálogo** para revisar a composição ou **Compradas** para ver o que já saiu. Toque numa carta para ver seus detalhes e ações. Os baralhos personalizados podem ser exportados em JSON. O JSON guarda os caminhos das imagens, não os arquivos de imagem em si. O editor gerencia as cartas e o monte, mas não aplica regras de partida de um TCG.

Também é possível ler baralhos no formato de pastas do Solo RPG Toolkit. Dentro de `Decks`, use uma subpasta por baralho. Coloque nela as imagens ou uma nota com as URLs. Uma linha `flip` permite inversão, `flip2` permite 90° à direita, `flip3` permite 90° para os dois lados e `flip4` permite as quatro direções. O caminho `Decks` pode ser alterado nas preferências.

#### Migrar do Obsidian Deck Builder

1. Deixe no cofre as notas com os blocos antigos `DeckCard` e `FullDeck`, junto às imagens.
2. Vá a **Kit solo → Baralhos → Importar cartas → Buscar notas do Deck Builder**.
3. Escolha uma lista **FullDeck** e importe, ou adicione o catálogo inteiro. A migração preserva cópias repetidas, seções, atributos e a descrição. Se a configuração do Deck Builder ainda estiver no cofre, também traz os ícones de mana e elemento. Cartas referenciadas mas não encontradas aparecem num aviso.
4. Salve o novo baralho. As notas antigas e os anexos não são reescritos. Para exibir uma carta nova numa nota use um bloco `brpg-card` com os campos do `DeckCard`. Um bloco `brpg-deck` aceita o nome de um baralho salvo ou uma lista no estilo `FullDeck`.

### Oráculos e tabelas

Os oráculos incluem **Padrão**, **Padrão II**, **FU**, **MUNE** e **Mythic**. Customize a chance, o modificador ou o fator de caos conforme o sistema. Resultados e eventos aparecem em português por padrão. Perguntas e respostas ficam no histórico da aba durante a sessão.

Em **Tabelas**, gere ganchos, personagens e lugares ou use notas suas na pasta `Tables`. Cada linha da nota é uma opção. Um sufixo `^3` triplica o peso em comparação a uma entrada sem peso. Um sufixo `2d` no nome do arquivo ou no título da seção concentra as escolhas no meio da lista. Propriedades YAML com texto podem ser modelos ponderados. Use `{Seção}`, `{Nota/Seção}`, `{/Caminho/Nota}`, `{Pasta/*}` para um título, `{Pasta/!}` para conteúdo, `{A|B}` para alternativas ou `{<nome}` para repetir um sorteio. Dicionários internos aceitam chaves como `{noun}`, `{verb}`, `{adjective}`, `{aspect}` ou equivalentes em português. Sufixos de pasta `.` e `_` ocultam suas notas da seleção sem impedir referências. A propriedade `mode: cutup` sorteia trechos da nota em vez de linhas. Em **Modelo rápido**, monte uma frase sem criar uma nota.

### Ferramentas nas notas

Ative **Dados, contadores e relógios nas notas** nas preferências do Kit solo. Use trechos de código inline com um par de crases para rolagens e fichas. Na **Prévia ao vivo**, selecione o trecho para editar sua sintaxe. No modo **Leitura**, o contador só é editável quando o Obsidian consegue confirmar sua posição no arquivo.

| Sintaxe inline | Resultado |
| --- | --- |
| `4` | Contador com −/+ |
| `2/6`, `limit: 2/6` | Progresso padrão ou contador com limite |
| `boxes: 2/6` | Seis caixas marcáveis |
| `clock: 2/6`, `smclock: 2/6`, `lgclock: 2/6` | Relógio, com tamanhos opcionais |
| `2d20/a+2,red` | Rolagem clicável com vantagem, modificador e cor |
| `dado: Nome do dado` | Rola o dado personalizado do Kit solo |
| Código inline só com espaços | Espaçamento de ficha |

O Kit solo adapta recursos do [Solo RPG Toolkit](https://github.com/alexkurowski/solo-toolkit), de Alex Kurowski. A licença MIT da parte adaptada está em [THIRD-PARTY-SOLO-LICENSE](THIRD-PARTY-SOLO-LICENSE).

## Mesa de campanha

Abra **Basic RPG → Abrir Mesa** na paleta de comandos ou use o ícone de espadas. A Mesa tem três abas e não precisa de nenhum outro plugin. A opção **Abrir Mesa na barra lateral** deixa uma nota aberta ao lado.

- **Campanhas** organiza aventuras, capítulos, sessões, cenas, NPCs, facções, locais, pistas, objetos, eventos e subtramas. Um registro pode apontar para uma nota e para outros registros. Vincule um calendário à campanha para registrar a data atual do mundo na sessão e voltar a esse dia depois. Criar um registro não cria nem altera um evento no calendário.
- **Fichas** reúne personagens de jogador, NPCs e criaturas. Crie atributos, recursos com limites, ações, traços e reações. Uma ação pode rolar expressões como `1d20+3`. Use **Modelo Arkanis** para começar com Vida, Esforço, Impulso e Estresse. Os valores preenchidos no modelo são exemplos editáveis. Fichas podem ser compartilhadas ou exclusivas de uma campanha.
- **Encontros** aceita fichas do bestiário ou participantes avulsos. Use quantidades fixas ou dados como `1d4`, dê apelidos aos participantes e defina as iniciativas ou role-as ao iniciar. Empates mantêm a ordem de entrada. Cada participante recebe sua própria cópia dos recursos, sem alterar a ficha-base. Um encontro em andamento por cofre é salvo junto com rodada, turno, ordem, recursos e condições.

### Blocos nas notas

Os nomes dos blocos são próprios do Basic RPG, por isso não conflitam com `statblock` ou `encounter` de outros plugins.

````md
```brpg-ficha
name: Guarda da Ponte
kind: npc
hp: 12
ac: 14
initiative: 1d20+2
actions:
  - name: Vigiar passagem
    roll: 1d20+3
    desc: Observa quem cruza a ponte.
```

```brpg-encontro
name: Patrulha na ponte
creatures:
  - sheet: Guarda da Ponte
    count: 1d4
    side: enemies
```
````

No primeiro bloco, **Importar ficha** na aba Fichas permite colar o YAML ou JSON na biblioteca. Uma ficha exibida apenas em um bloco inline não é cadastrada automaticamente. O exemplo de encontro usa o nome de uma ficha já cadastrada. Também é possível usar `ref: Nome do encontro` ou `ref: Nome da ficha` nos respectivos blocos. Se houver nomes repetidos, use o ID exibido na edição.

A importação de fichas reconhece um subconjunto dos campos do Fantasy Statblocks, incluindo `name`, `hp`, `ac`, `stats`, `actions`, `traits` e `reactions`. A Mesa inicial não inclui migração completa de campanhas do RPG Manager, layouts do Fantasy Statblocks ou o bestiário SRD. As três referências são [RPG Manager](https://github.com/carlonicora/obsidian-rpg-manager), [Initiative Tracker](https://github.com/obsidian-ttrpg-community/initiative-tracker) e [Fantasy Statblocks](https://github.com/obsidian-ttrpg-community/fantasy-statblocks).

## Relógio em tempo real

Ao abrir pela primeira vez, ou ao atualizar um calendário que ainda não tem uma configuração de relógio, o Basic RPG ativa **Tempo real** usando a data e a hora que já estavam salvas. Por padrão, **24 horas reais equivalem a um dia completo do mundo**. Altere a proporção em **Editar calendário → Geral → Relógio do mundo**. Nessa mesma seção, você pode fazer um calendário acompanhar outro com uma diferença em dias. O calendário vinculado avança junto à referência e preserva a data ao ser desvinculado.

O plugin guarda o horário real de referência. Fechar o Obsidian não congela a campanha. Ao reabrir, o Basic RPG calcula quantos dias e minutos passaram, sem serviços externos e sem executar nada em segundo plano. Os eventos salvos continuam na mesma data.

Use **Definir data e hora do mundo** para ajustar a data, alinhar a hora à posição no dia real do aparelho ou mudar para **Manual**. O modo manual pausa o avanço a partir da hora mostrada. O alinhamento preserva a data que você selecionou, por exemplo, meio-dia local vira **16:00 em Arkanis**. Alterar o tamanho do dia sem informar outra hora mantém a mesma proporção do dia do mundo.

## Céu e sóis

Abra **Céu** ou escolha o ícone solar em **Dia em foco**. Os discos dos sóis mostram cor, tamanho relativo e estado de visibilidade. As luas têm discos proporcionais ao tamanho aparente, com fase, porcentagem iluminada e brilho quando estão acima do horizonte. Na aba **Céu**, os cartões ficam recolhidos por padrão. Toque no disco ou nome para ver detalhes como fase, horários e diâmetro. Em **Configurar luas**, o campo **Tamanho aparente (raio em °)** muda a exibição e o cálculo dos eclipses. Em **Dia em foco**, os dois grupos aparecem juntos na hora do mundo ou ao meio-dia para outras datas. Toque em qualquer grupo para abrir o céu da data. Em **Horários e órbitas dos sóis** e **Horários e órbitas das luas**, a faixa de cada astro mostra quando ele fica acima do horizonte. A linha indica a hora em consulta.

No dia atual, **Hora do mundo** acompanha o relógio. Arraste a barra, use **−/+** para saltar uma hora, toque nos horários da escala ou digite `HH:MM`. Isso fixa uma prévia sem mexer no relógio da campanha. Use **Hora do mundo** pra voltar à observação ao vivo.

O preset Arkanis usa **Innart, Dinart e Reart**. Reart é a referência, chega ao ponto mais alto às **16:00** e nasce em todos os dias. Há dias em que Innart ou Dinart não nascem e dias com sobreposição. O cálculo usa órbitas circulares independentes, com período proporcional ao semieixo elevado a 3/2. É uma aproximação para um céu fictício, sem interação gravitacional entre as três estrelas. [Referência de órbitas e gravidade](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/).

Em **Céu → Configurar sóis**, edite a latitude, o período da órbita de referência e os parâmetros de cada sol. A latitude e a inclinação do sol de referência precisam permitir que ele nasça em qualquer dia. Calendários antigos com o preset Arkanis ganham o modelo solar sem perder datas nem eventos. Outros mundos começam com o céu vazio.

## Nascer e pôr

A aba **Céu** mostra os horários de cada sol e lua, se estão acima do horizonte na hora observada e a próxima mudança antes da virada do dia. Em **Configurar sóis** ou **Configurar luas → Nascer e pôr**, escolha horários automáticos pela órbita, ajustes de cada horário em minutos ou um par fixo `HH:MM`. A opção fixa pode atravessar a meia-noite, por exemplo, **27:00 → 02:00** no relógio de Arkanis.

O cálculo automático usa a data e a latitude. À medida que o dia avança, mudam a visibilidade e a próxima virada. Os horários automáticos são recalculados na troca de data e o plugin recupera o relógio na reabertura do Obsidian. Horários fixos modificam a visibilidade exibida, não a órbita, a fase da lua nem a geometria dos eclipses.

Em **Editar calendário → Clima → Regiões → Horizonte regional**, escolha latitude, fuso e regras individuais dos astros. A escala principal e as viradas da previsão usam o relógio do mundo. O painel mostra também a hora local quando há fuso configurado.

## Eclipses

Abra **Céu → Eclipses**. O painel mostra quando começa, o máximo, o fim e como está o horizonte no máximo. O controle de hora marca quando o alinhamento está em curso na simulação, mesmo se ele ocorrer abaixo do horizonte. A previsão indica também quando o evento continua no dia seguinte. **Próximo eclipse** procura o próximo pico após a data selecionada, até 366 dias, e abre a previsão na hora daquele pico. A consulta não muda a data da campanha e não cria eventos no cofre.

O Basic RPG diferencia eclipses solares **totais**, **parciais** e **anulares** e lunares **totais**, **parciais** e **penumbrais**. Eclipses solares são calculados para cada par lua–sol. Um eclipse lunar representa a sombra do planeta em relação a um dos sóis. Se houver outros, ainda podem iluminar a lua.

Em **Editar calendário → Luas → Órbita e eclipses**, você pode ajustar a inclinação, o nó ascendente, o raio aparente da lua e o raio da sombra. Luas ocultas não entram na previsão. O modelo usa discos angulares e um plano lunar circular, com a direção solar fixa ao longo de cada dia. Não simula paralaxe, mapas de sombra nem a interação gravitacional entre os corpos. É uma previsão para mundos fictícios. [Referência de geometria dos eclipses](https://science.nasa.gov/eclipses/geometry/).

## Clima

Abra a aba **Clima**, use o atalho em **Dia em foco** ou **Céu**, ou encontre **Abrir clima da campanha** na paleta de comandos. A previsão mostra condição atual, mínima e máxima, vento e direção, rajadas, umidade, nuvens, chance e intensidade de precipitação e visibilidade. Neblina tende a ocorrer à noite e de manhã. Dependendo do frio, da intensidade e do vento, a precipitação pode aparecer como garoa, chuva, tempestade, neve ou nevasca.

O dia atual acompanha o relógio do mundo. Nas outras datas, o destaque é a prévia ao meio-dia, com quatro horários para consultar e até cinco dias seguintes. Toque em uma data da previsão para abri-la sem mudar o relógio da campanha.

Em **Clima → Configurar clima**, escolha a região ativa ou crie outra. Cada região tem um perfil-base e pode substituir os valores por estação. Use perfis iniciais de clima temperado, quente e úmido, árido, frio ou de costa úmida. Edite as faixas de temperatura, chuva, vento, umidade e neblina, o ponto de congelamento, as unidades e o atraso das condições em relação às estações. Sem estações, o perfil-base vale o ano todo. A temperatura e o vento são configurados em °C e km/h mesmo se a visualização usar °F e mph.

Arkanis vem com **Solus**, **Centrus** e **Nortus**, com perfis iniciais editáveis e **Centrus** selecionada. Outros mundos sem clima salvo começam com a opção desligada. A previsão é uma simulação fictícia independente, sem internet, baseada na data, na região e na semente. A mesma configuração repete a previsão mesmo após fechar o Obsidian. Alterar semente, perfis ou estrutura do calendário pode mudar o clima de datas antigas.

## Estações e efeito no clima

Vá em **Clima → Estações** ou toque no nome da estação em **Dia em foco**. A tela reúne a estação da data selecionada, o progresso e a próxima virada num resumo. A lista do ciclo mostra as datas e a faixa de temperatura de cada estação para a região selecionada. Toque numa estação para ver o restante do clima, ir ao primeiro dia ou editar o perfil regional. A seta abre a data de início da próxima estação sem avançar o relógio da campanha. Os inícios também ficam marcados na grade e na lista do calendário.

Em **Editar estações**, configure nome, cor e início em uma data fixa ou a duração de cada trecho de um ciclo contínuo. Arkanis começa com **Velanthir**, seguida de **Solanarê**, **Drosmy** e **Kealyth**, com 252 dias cada um. Eventos vinculados ao início de estação continuam aparecendo no dia correspondente.

Em **Ajustes climáticos da estação**, use valores positivos ou negativos para modificar temperatura, chance e intensidade de precipitação, umidade, vento e neblina. Os ajustes são somados ao perfil de cada região. Por exemplo, **+20** em precipitação transforma uma chance de **35%** em **55%** no perfil daquela estação. Também dá pra usar um perfil diferente para cada par de região e estação em **Editar perfil da região**.

A previsão faz a transição de um perfil para o próximo aos poucos. O atraso configurado no clima desloca essa transição sem mover a estação no calendário. Em Arkanis, o atraso inicial é de **64 dias do mundo**.

## Eventos, agenda e notas

Em **Exibição e filtros**, alterne entre **Mês**, **Ano** e **Agenda**. A agenda lista ocorrências nos próximos 30 dias e separa os eventos sem data. A cronologia anual mostra a primeira ocorrência de cada evento no ano. Em **Editar calendário → Notas e eventos**, você pode configurar categorias padrão e avisos de eventos ao virar o dia com o Obsidian aberto.

Em **Novo evento → Recorrência → Intervalo ou condições**, informe uma data de referência e um intervalo em dias, semanas, meses ou anos. Combine condições de mês, dia, semana, fase lunar, estação ou dias depois de um evento simples. Para consultar só as condições, use intervalo de um dia. Condições lunares são verificadas ao meio-dia. **Prévia de ocorrências** busca até dez resultados nos primeiros 5.000 dias após a data inicial.

Para alimentar o calendário com as notas, ative **Criar eventos a partir das notas** em **Notas e eventos**. Você pode limitar a busca à pasta da campanha. Use `fc-date` em formato ano-mês-dia ou com as propriedades `year`, `month` e `day`. Em objetos de data, omitir o ano permite repetir anualmente e omitir o mês permite repetir mensalmente. Há suporte também a `fc-calendar`, `fc-end`, `fc-category`, `fc-display-name` e `fc-hidden`. As opções extras leem datas no início dos títulos ou linhas como `brpg: 1-01-07 | Encontro na praça`. Alterações nas notas atualizam a Agenda sem reescrever as notas nem duplicar eventos no `data.json`. O comando **Atualizar eventos das notas** refaz a leitura.

O comando **Inserir data do mundo na nota** usa o formato definido em **Ciclos e datas**. Essa seção também permite dar nomes a anos e criar ciclos independentes por dia, mês ou ano. Para mundos que começam antes do ano 1, escolha o primeiro ano em **Geral**. Alterar esse primeiro ano muda a origem da contagem e, portanto, pode deslocar ciclos e previsões.

### Blocos Markdown

````md
```basic-rpg-calendar
calendar: Arkanis
view: agenda
```

```basic-rpg-weather
calendar: Arkanis
date: 1-01-07
```
````

Omitir `view` mostra o mês. Omitir `date` acompanha a data do mundo. Os blocos não mostram eventos reservados.

A API de leitura para plugins companheiros fica na instância do Basic RPG, acessível por `app.plugins.plugins["basic-rpg"].api`. Ela oferece `calendars()`, `current(nome)` e `day(nome, data)`, incluindo os horários dos astros em minutos do relógio do mundo.

## Importação, exportação e compartilhamento

Em **Configurações → Basic RPG → Biblioteca e backup**, **Importar JSON** cria outro calendário. O Basic RPG lê seu próprio backup e estruturas compatíveis do Fantasy Calendar e do Calendarium. Regras de eventos sem equivalente geram avisos. Regras estruturais incompatíveis são rejeitadas em vez de deslocar datas silenciosamente. O motor climático próprio não reproduz os resultados exatos de outras plataformas.

- **Salvar JSON no cofre** guarda a configuração completa do Basic RPG. Eventos derivados de notas continuam nos arquivos Markdown.
- **Exportar para Fantasy Calendar** salva um JSON com a estrutura, a data, as luas, os perfis climáticos equivalentes e os eventos suportados. Os detalhes do céu multissolar, eclipses, vínculos, ajustes locais sem equivalente e algumas condições não passam para o outro formato. As diferenças aparecem junto do caminho do arquivo.
- **Gerar resumo para jogadores** salva uma nota com a data e os eventos públicos do dia, sem caminhos para notas reservadas. É um arquivo para compartilhar manualmente, não uma publicação online ou um sistema de permissões.
- **Preset Arkanis** e **Preset Gregoriano** criam calendários novos sem sobrescrever os que já existem.

## Instalação manual

1. Baixe o ZIP da [release do Basic RPG](https://github.com/AlanDarfin/Basic-RPG-Tools-For-GMs/releases/latest) ou crie a pasta `.obsidian/plugins/basic-rpg/` no cofre para instalar os arquivos individuais.
2. Copie os arquivos [`manifest.json`](manifest.json), [`main.js`](main.js) e [`styles.css`](styles.css) da raiz deste repositório para essa pasta.
3. Em uma atualização, mantenha o arquivo `data.json`. Reabra o cofre ou recarregue o aplicativo e ative **Basic RPG** em **Plugins da comunidade**.

Compatibilidade declarada a partir do Obsidian 1.7.2. O plugin não usa APIs de Node.js no aplicativo e foi projetado para desktop e Android. A instalação manual no Android requer que a pasta do plugin seja acessível pelo gerenciador de arquivos ou pela sincronização do seu cofre.

## Desenvolvimento

Com Node.js 20 ou superior, não é necessário instalar dependências para compilar ou rodar os testes:

```sh
npm run build
npm test
```

O código-fonte fica em `src/`. O arquivo `main.js` é gerado a partir dele e pode ser copiado direto para a pasta do plugin.

O Basic RPG é uma implementação independente inspirada no [Calendarium](https://github.com/javalent/calendarium), de Javalent. O preset Arkanis usa os dados do [Arkanis Calendar](https://github.com/AlanDarfin/Arkanis-Calendar).


## Ultra RPG: Estúdio e Biblioteca (1.3.0)

A **Mesa** passa a reunir Campanhas, Fichas, Encontros, Estúdio e Biblioteca. O plugin funciona sem depender dos três projetos usados como inspiração, e integra-se opcionalmente aos plugins originais quando instalados.

### Ações, recursos e descanso

- Em **Fichas**, configure uma ação com **Rolagem / ataque** (por exemplo, `1d20+3`), **Dano automático** (`1d8+2`) e **Custo do recurso** (`Esforço:2`). Os campos são opcionais.
- Inicie um encontro e use **Rolar e resolver**. O Basic RPG rola o teste, verifica a CA disponível e aplica o dano na Vida do alvo somente quando a defesa é conhecida e o teste acerta. Se não existir CA e houver teste de ataque, o dano não é aplicado automaticamente.
- Os gastos afetam apenas os recursos da instância em combate. A ficha-base continua intacta. As ações são registradas no histórico da Mesa.
- A ficha cadastrada apresenta recursos com botões −/+ e **Descanso / restaurar**. Configure por recurso a recuperação: ao máximo, zerar ou manter. Esses valores de jogo ficam separados do modelo da ficha e sobrevivem à reabertura do Obsidian.

### Estúdio

O Estúdio tem seis geradores locais: NPCs, lugares, tavernas, ganchos de aventura, tesouros e ideias de encontros. Os resultados podem ser copiados, inseridos em uma nota, cadastrados como registros de campanha ou transformados em uma ficha simples de NPC. Dados aleatórios e tabelas continuam disponíveis no Kit Solo.

Quando o plugin original **TTRPG Content Generator** estiver instalado, a Mesa detecta a API dele e oferece os seus geradores junto aos locais. O Basic RPG usa a API pública do plugin existente, sem tentar reproduzir a linguagem avançada de scripts.

### Biblioteca

A Biblioteca pesquisa imagens, tokens, áudios e notas **já presentes no cofre**. Pode copiar links internos, inseri-los em notas ou atribuir uma imagem como retrato de ficha.

Se o plugin Moulinette original estiver habilitado, a Biblioteca identifica e pode executar o comando para abrir o navegador dele. **Não** inclui uma integração independente com a nuvem Moulinette, nem contorna autenticação, pagamentos ou licenças de criadores.

### Blocos Markdown

```brpg-painel
ref: Nome da ficha salva
```

```brpg-gerador
type: npc
campaign: Nome da campanha
```

O primeiro exibe atributos e contadores persistentes de uma ficha da biblioteca. O segundo gera conteúdo e, quando uma campanha é indicada, permite salvá-lo como registro.

### Referências, escopo e compatibilidade

- [Moulinette Search for TTRPG](https://github.com/svenwerlen/moulinette-obsidian-plugin)
- [TTRPG UI Toolkit](https://github.com/hay-kot/obsidian-ttrpg-ui-toolkit)
- [TTRPG Content Generator](https://github.com/gregory-jagermeister/TTRPG-Content-Generator)

Esta implementação é independente e não redistribui conteúdo dos catálogos externos. A versão 1.3.0 não substitui as regras completas de D&D, não importa automaticamente os componentes do UI Toolkit, não executa downloads diretos do Moulinette Cloud e não interpreta integralmente todos os modelos avançados do TTRPG Content Generator.

Execute `npm test` para validar o núcleo do plugin e `npm run build` para reconstruir `main.js` a partir de `src/`.


## Atlas: mapas e relações (1.4.0)

**Atlas** é uma ferramenta integrada à Mesa para desenho de mapas de RPG e organização das relações da campanha. Não exige instalar Windrose, Hexmaker nem Relations.

### Mapas hexagonais e quadrados

- **Novo mapa** permite escolher grade hexagonal ou quadrada, tamanho, nome, campanha, terreno padrão e imagem de fundo existente no cofre.
- Em **Terreno**, toque e arraste para pintar planície, floresta, colina, montanha, água, pântano, deserto, estrada, parede ou piso. Pincéis de 1, 3 ou até 7 células, com suporte a toque.
- Em **Névoa**, esconda e revele células. **Visualização do mestre** controla a exibição de segredos e locais inexplorados na interface. Isso é um filtro visual, não um mecanismo de controle de acesso aos arquivos.
- Em **Rotas**, toque em pontos sucessivos, veja o custo relativo de deslocamento conforme o terreno e salve caminhos no mapa.
- Em **Tokens**, escolha uma ficha da Mesa e toque em uma célula para colocá-la ou movê-la.
- Em cada célula, configure região, facção, nome, descrição, segredo, nota do cofre, tabela de encontros, ficha, encontro preparado ou submapa. O editor abre os registros existentes, em vez de criar cópias.
- Use **Gerar terreno** num mapa hexagonal ou **Gerar masmorra** em um mapa quadrado para preencher as cores de terreno, preservando os vínculos e tokens existentes.
- **Criar nota do hex** grava uma nota Markdown em `Basic RPG/Mapas/<Mapa>/Celula-x-y.md` com identificação de mapa e coordenadas. Notas preexistentes não são sobrescritas.
- Se uma célula tiver uma tabela Markdown vinculada, **Rolar encontro** usa o motor local de tabelas do Kit Solo.

### Rede de relações

O painel **Relações** reúne vínculos manuais da Mesa, conexões entre registros, associações entre mapas e entidades e vínculos declarados nas propriedades de notas (por exemplo `ally`, `enemy`, `family`, `parent`, `child`, `spouse`, `mentor`, `member`, `leader`).

É possível escolher um centro, profundidade, filtrar o tipo de vínculo e alternar entre a disposição em rede e uma hierarquia simples. Clique em um nó para abrir sua nota, ficha, registro ou mapa. A visualização é leve para dispositivos móveis e não tenta implementar a renderização genealógica avançada do plugin Relations.

### Blocos Markdown

Exibir um mapa salvo em uma nota:

~~~md
```brpg-mapa
ref: Vale Lunar
view: player
```
~~~

Vínculos de uma campanha:

~~~md
```brpg-relacoes
campaign: Crônicas de Arkanis
depth: 2
```
~~~

Blocos usam os dados da Mesa e mostram a versão atual no Obsidian. A opção `view: player` mascara as células com neblina, mas não criptografa nem oculta os dados do cofre.

### Integração

Campanhas, fichas, encontros e notas compartilham referências com o Atlas. A Mesa tem atalhos para abrir os mapas, e a busca de fichas pode indicar em qual mapa existe um token ou vínculo de célula. Excluir uma ficha com vínculos cartográficos exige desvinculá-la antes.

### Referências e limites

- [Windrose MapDesigner](https://github.com/alas-poor-ophelia/windrose-md): pintura de terrenos, grades, regiões, objetos, névoa, rotas e submapas.
- [Hexmaker](https://github.com/sbuffkin/hexmaker): células ligadas a notas, terreno, facções, tokens e tabelas de encontro.
- [Relations](https://github.com/obsidian-ttrpg-community/Relations): relações tipadas entre notas, filtros, exploração de vizinhança e grafos incorporados.

Esta é uma implementação nova e independente. **Ainda não** oferece importação automática de mapas dos dois plugins, pacotes Dungeondraft, pintura por imagem com múltiplas camadas, rotas Bezier, medição em sistemas de jogo ou editor de árvore genealógica equivalente ao Relations. Os mapas são armazenados no `data.json` do Basic RPG e as notas criadas permanecem arquivos Markdown normais.

**Texturas de imagem (v1.4.0):** além de cores, o modo **Textura** permite escolher imagens do cofre como revestimento de células, com recorte hexagonal ou quadrado. O editor da célula também aceita caminho de textura individual. A caixa de ferramentas oferece pincéis de vários tamanhos, e os modos **Regiões** e **Facções** destacam áreas identificadas no mapa. Texturas são apenas caminhos para imagens existentes; não há importação automática de tilesets, brushes contínuos ou pacotes Dungeondraft nesta versão.


## Biblioteca de modelos (v1.5.0)

**Calendários → Modelos de calendário** ou Configurações → **Galeria de modelos**:
Arkanis, Gregoriano, 13 Luas (fictício), Lunar de campanha (fictício), Solar de oito dias e Personalizado em branco.
Os modelos são apenas pontos de partida: um novo calendário é aberto no editor antes de ser salvo; o original e os outros calendários permanecem intactos.
O gregoriano usa meses reais e ano bissexto de quatro em quatro anos, exceto séculos não divisíveis por 400.
O modelo de 13 Luas tem 13 meses de 28 dias e 1 dia anual fora da semana, e o Solar de oito dias tem cinco festivais anuais.
Os modelos fictícios não pretendem representar calendários históricos ou religiosos.

**Atlas → Novo mapa ou modelo**:
Mapa-múndi · Terra alternativa (40×22 hexágonos), Arquipélago, Região de aventura,
Masmorra gerada, Hexágonos em branco e Quadrados em branco. Os mapas novos usam a mesma
biblioteca de fichas, encontros, regiões e notas que os mapas criados manualmente. É possível
alterar nomes, adicionar cidades, estados e províncias fictícios e converter células de terreno.

O mapa-múndi é uma **aproximação estilizada**, sem divisão política, derivada de
[polígonos de terra Natural Earth 1:110m](https://www.naturalearthdata.com/about/terms-of-use/)
(disponíveis em domínio público), rasterizados em células hexagonais. Não é um mapa para
navegação ou cartografia precisa. Sua topografia foi simplificada para exploração de RPG.

### Primeiras correções de estabilidade

- O gráfico de relações agora limita o percurso corretamente ao número de conexões escolhido.
- A validação de mapas rejeita cadeias circulares de submapas, incluindo ciclos com três ou mais mapas.
- A biblioteca é opt-in; nenhum modelo é inserido silenciosamente nos dados existentes.

A v1.5.0 é **a primeira etapa de preparação para a v2**, não a v2 completa.
Ainda falta a Central de Sessão, otimização de gravação de mapas grandes, importar mapas antigos
e testar a interface manualmente no Obsidian Android.


## Central de Sessão (v1.6.0)

A primeira aba da **Mesa → Sessão** reúne o progresso da campanha e as ferramentas mais usadas.
Ela mostra a data do calendário vinculado (ou do calendário ativo quando nenhum foi definido),
a previsão do clima, o lugar atual do Atlas, os personagens e o combate em andamento.

**Iniciar sessão:** escolha uma campanha e crie um novo registro de sessão ou selecione um
registro já cadastrado. A sessão é mantida no data.json e pode ser pausada e retomada após
fechar o Obsidian. Só pode haver uma sessão ativa ou pausada por cofre.

**Diário rápido:** registre notas durante a sessão; ao encerrar, as entradas são transferidas
para o resumo do registro de sessão. O fim da sessão não apaga um encontro em andamento.
**Localização:** escolha um mapa da campanha, informe coordenadas no formato coluna,linha ou
abra o Atlas e toque em **Marcar como local da sessão** na célula. O painel atualiza os atalhos e
mostra a região e o nome do local quando disponíveis.

**Ações rápidas:** Dados, Oráculos, Baralhos, Fichas, Encontros, Estúdio, Atlas e Relações.
Um encontro da campanha aparece no painel com rodada, turno e avanço manual; esse avanço
é desabilitado enquanto a sessão estiver pausada.

As sessões são opcionais: dados antigos continuam válidos, sem criar registros automaticamente.
A API somente leitura \`api.session()\` retorna IDs e status, sem expor notas privadas.

A Central reúne as ferramentas do mestre, mas não executa viagens, clima ou encontros
automaticamente. A automação de exploração continua no roteiro da v2.

O diário completo é preservado no campo estruturado `sessionJournal` do registro. O resumo mostra apenas um trecho caso alcance o limite de 10 mil caracteres. A aba **Campanhas** exibe até 30 anotações recentes sem apagar as anteriores.
