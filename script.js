let listArr = [];
let useIpMap = {}; // controla se cada condomínio está usando IP ou domínio
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { db } from "./firebase.js"; // ajuste o nome se for diferente

async function loadData() {
  try {
    const querySnapshot = await getDocs(collection(db, "condominios"));
    listArr = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      data.id = doc.id;
      listArr.push(data);
    });

    createCards(listArr);
  } catch (error) {
    console.log("Erro ao carregar dados do Firestore:", error);
  }
}


function createCards(listArr) {
  let cardContainer = document.getElementById("card-container");

  while (cardContainer.firstChild) {
    cardContainer.removeChild(cardContainer.firstChild);
  }

  listArr.forEach((condominio) => {
    let card = document.createElement("div");
    card.className = "card";
    card.id = "card";

    const nomeCondominio = document.createElement("p");
    nomeCondominio.innerText = condominio.nome;
    nomeCondominio.className = "nome";
    card.appendChild(nomeCondominio);

    // Botão para alternar IP/Domínio
    const toggleButton = document.createElement("button");
    toggleButton.innerText = "Usar IP";
    toggleButton.className = "toggleButton";
    toggleButton.addEventListener("click", function () {
      useIpMap[condominio.id] = !useIpMap[condominio.id];
      toggleButton.innerText = useIpMap[condominio.id] ? "Usar Domínio" : "Usar IP";

      // Recria os botões NAT com nova configuração
      createButtons(condominio, card);
    });
    card.appendChild(toggleButton);

    // Botão "Teste"
    const testButton = document.createElement("button");
    testButton.innerText = "Teste";
    testButton.className = "testButton";

    testButton.addEventListener("click", async function () {
      testButton.style.boxShadow = ""; // limpa o estilo

      const dominio = condominio.dominio;
      const natList = condominio.nat;

      let algumOffline = false;

      for (const dispositivo of natList) {
        const porta = dispositivo.Porta;

        try {
          const res = await fetch(`http://localhost:3001/ping?dominio=${dominio}&porta=${porta}`);
          const data = await res.json();

          if (!data.online) {
            algumOffline = true;
            break; // pode parar no primeiro offline
          }
        } catch (error) {
          console.error(`Erro ao testar ${dominio}:${porta}`, error);
          algumOffline = true;
          break;
        }
      }

      if (algumOffline) {
        testButton.style.boxShadow = "0 0 15px red";
      } else {
        testButton.style.boxShadow = "0 0 15px limegreen";
      }
    });

    card.appendChild(testButton);


    // Inicializa visualização com Domínio
    useIpMap[condominio.id] = false;
    createButtons(condominio, card);
    console.log(condominio.nome)

    cardContainer.appendChild(card);
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.className = "show";
  setTimeout(() => {
    toast.className = toast.className.replace("show", "");
  }, 3000);
}

function createButtons(condominio, card) {
  // Remove botões antigos (mantendo os 3 primeiros elementos: nome, toggle e teste)
  while (card.children.length > 3) {
    card.removeChild(card.lastChild);
  }

  const useIp = useIpMap[condominio.id];

  // Botão Mikrotik
  const mikrotikInfo = condominio.nat.find(device => device.Nome.toLowerCase().includes("mikrotik"));

  if (mikrotikInfo) {
    const mikrotikUrl = useIp
      ? `${mikrotikInfo.IP}:${mikrotikInfo.Porta}`
      : `${condominio.dominio}:${mikrotikInfo.Porta}`;

    const mikrotikButton = document.createElement("button");
    mikrotikButton.innerText = "Mikrotik";
    mikrotikButton.className = "button";
    mikrotikButton.style.backgroundColor = useIp ? "#5e2a8a" : "#6666cc"; // roxo escuro ou cor padrão

    mikrotikButton.addEventListener("click", function () {
      navigator.clipboard.writeText(mikrotikUrl).then(() => {
        showToast("Copiado: " + mikrotikUrl);
      }).catch((err) => {
        console.error("Erro ao copiar Mikrotik:", err);
      });
    });

    card.appendChild(mikrotikButton);
  }

  condominio.nat.forEach((dispositivo) => {
    const nome = dispositivo.Nome.toUpperCase();
    const porta = dispositivo.Porta;

    // ❌ Condição 1: "ATA" mas porta diferente de 8889 ou 8887
    if (nome.includes("ATA") && porta !== "8889" && porta !== "8887") return;

    // ❌ Condição 2: "GUARITA" mas porta diferente de 8093
    if (nome.includes("GUARITA") && porta !== "8093") return;

    // ❌ Condição 3: Nome contém "MASQUERADE"
    if (nome.includes("MASQUERADE")) return;

    // ❌ Condição 4: Nome contém "Mikrotik"
    if (porta.includes("7890")) return;

    // ✅ Criação do botão se passou pelos filtros
    const botao = document.createElement("button");
    botao.innerText = `${dispositivo.Nome} - ${dispositivo.Porta}`;
    botao.className = "button";

    // Cor condicional
    botao.style.backgroundColor = useIp ? "#c77dd9" : "#4caf50";

    const url = useIp
      ? `http://${dispositivo.IP}`
      : `http://${condominio.dominio}:${dispositivo.Porta}`;

    botao.addEventListener("click", function (event) {
      event.preventDefault();
      window.open(url, "_blank");
      navigator.clipboard.writeText(url).catch(function (err) {
        console.error("Erro ao copiar o link: ", err);
      });
    });

    card.appendChild(botao);
  });
}



document.getElementById('search-bar').addEventListener("input", matchingCards);
document.getElementById('search-bar').addEventListener("change", matchingCards);

function matchingCards() {
  var input = this.value.toLowerCase();
  var cards = document.getElementsByClassName('card');
  console.log("match executado");

  Array.from(cards).forEach(function (card) {
    var name = card.getElementsByTagName('p')[0].textContent.toLowerCase();
    var tronco = card.getElementsByTagName('button')[0].textContent.toLowerCase();
    if (name.includes(input) || tronco.includes(input)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

document.getElementById('eraser').addEventListener("click", function () {
  var input = document.getElementById('search-bar');
  input.value = "";
  var cards = document.getElementsByClassName('card');

  Array.from(cards).forEach(function (card) {
    card.style.display = 'block';
  });

  input.focus();
})

loadData();

