import { collection, getDocs, doc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { db } from "./firebase.js";

// --- Variáveis Globais ---
let listArr = []; 
let useIpMap = {}; 

// --- Carregamento ---
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
    console.error("Erro ao carregar dados:", error);
    showToast("Erro ao carregar dados.");
  }
}

// --- Criação dos Cards ---
function createCards(lista) {
  let cardContainer = document.getElementById("card-container");
  cardContainer.innerHTML = "";

  // Ordena por nome
  lista.sort((a, b) => a.nome.localeCompare(b.nome));

  lista.forEach((condominio) => {
    let card = document.createElement("div");
    card.className = "card";
    // Layout Flex Coluna para alinhar elementos
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.alignItems = "center";

    const nomeCondominio = document.createElement("p");
    nomeCondominio.innerText = condominio.nome;
    nomeCondominio.className = "nome";
    card.appendChild(nomeCondominio);

    if (useIpMap[condominio.id] === undefined) {
      useIpMap[condominio.id] = false;
    }

    const devicesContainer = document.createElement("div");
    devicesContainer.className = "devices-container"; 
    
    // Toggle IP/Domínio
    const toggleButton = document.createElement("button");
    toggleButton.innerText = useIpMap[condominio.id] ? "Usar Domínio" : "Usar IP";
    toggleButton.className = "toggleButton";
    toggleButton.addEventListener("click", function () {
      useIpMap[condominio.id] = !useIpMap[condominio.id];
      toggleButton.innerText = useIpMap[condominio.id] ? "Usar Domínio" : "Usar IP";
      renderDeviceButtons(condominio, card, devicesContainer);
    });
    card.appendChild(toggleButton);

    // Teste Ping
    const testButton = document.createElement("button");
    testButton.innerText = "Teste";
    testButton.className = "testButton";
    testButton.addEventListener("click", () => runPingTest(condominio, devicesContainer));
    card.appendChild(testButton);

    card.appendChild(devicesContainer);
    renderDeviceButtons(condominio, card, devicesContainer);

    // Botão Adicionar Dispositivo (+)
    const addBtn = document.createElement("button");
    addBtn.innerText = "+";
    addBtn.className = "add-device-btn";
    addBtn.title = "Adicionar Dispositivo";
    addBtn.onclick = function() {
        openDeviceModal(condominio.id); 
    };
    card.appendChild(addBtn);

    cardContainer.appendChild(card);
  });
}

// --- Renderização de Botões ---
function renderDeviceButtons(condominio, card, container) {
  container.innerHTML = "";
  const useIp = useIpMap[condominio.id];

  const createWrapper = (label, url, originalDevice, bgColor) => {
      const wrapper = document.createElement("div");
      wrapper.className = "device-wrapper";

      const btn = document.createElement("button");
      btn.innerText = label;
      btn.className = "button";
      btn.style.backgroundColor = bgColor;
      if(originalDevice && originalDevice.Porta) btn.dataset.porta = originalDevice.Porta;

      btn.addEventListener("click", (e) => {
          e.preventDefault();
          window.open(url, "_blank");
          navigator.clipboard.writeText(url);
      });

      const editBtn = document.createElement("button");
      editBtn.innerHTML = "✎";
      editBtn.className = "edit-btn";
      editBtn.title = "Editar";
      editBtn.onclick = (e) => {
          e.stopPropagation();
          openDeviceModal(condominio.id, originalDevice);
      };

      wrapper.appendChild(btn);
      wrapper.appendChild(editBtn);
      return wrapper;
  };

  // Mikrotik
  if (condominio.nat) {
      const mk = condominio.nat.find(d => d.Nome.toLowerCase().includes("mikrotik"));
      if (mk && !mk.Porta.includes("7890")) {
          const url = useIp ? `${mk.IP}:${mk.Porta}` : `${condominio.dominio}:${mk.Porta}`;
          const color = useIp ? "#5e2a8a" : "#6666cc";
          container.appendChild(createWrapper("Mikrotik", url, mk, color));
      }
  }

  if (!condominio.nat) return;

  // Outros Dispositivos
  condominio.nat.forEach((dev) => {
    const nome = dev.Nome.toUpperCase();
    const porta = dev.Porta;

    if (nome.includes("ATA") && porta !== "8889" && porta !== "8887") return;
    if (nome.includes("GUARITA") && porta !== "8093") return;
    if (nome.includes("MASQUERADE")) return;
    if (porta.includes("7890")) return;

    const color = useIp ? "#c77dd9" : "#4caf50";
    
    // ============================================================
    // NOVA LÓGICA DE URL (IP vs DOMÍNIO com Regra de DVR/NVR)
    // ============================================================
    let url;
    if (useIp) {
        // Se estiver usando IP Interno:
        // Adiciona a porta APENAS se for DVR ou NVR
        if (nome.includes("DVR") || nome.includes("NVR")) {
            url = `http://${dev.IP}:${dev.Porta}`;
        } else {
            // Para outros (câmeras, etc), usa apenas o IP (porta padrão 80)
            url = `http://${dev.IP}`;
        }
    } else {
        // Se estiver usando Domínio Externo:
        // Sempre usa a porta (NAT)
        url = `http://${condominio.dominio}:${dev.Porta}`;
    }
    // ============================================================

    const label = `${dev.Nome} - ${dev.Porta}`;

    container.appendChild(createWrapper(label, url, dev, color));
  });
}

// --- Ping Test ---
async function runPingTest(condominio, devicesContainer) {
    const dominio = condominio.dominio;
    const portaBotaoMap = {};
    const portas = [];

    const botoes = devicesContainer.querySelectorAll(".button");

    botoes.forEach((btn) => {
        let porta = btn.dataset.porta;
        if (!porta) {
            const match = btn.innerText.match(/- (\d+)/);
            if (match) porta = match[1];
        }
        if (porta) {
            portas.push(porta);
            portaBotaoMap[porta] = btn;
        }
    });

    if (portas.length === 0) {
        showToast("Nenhum dispositivo testável.");
        return;
    }

    showToast("Testando conexão...");

    try {
        const res = await fetch(`https://ping-api-fqks.onrender.com/ping?dominio=${dominio}&portas=${portas.join(',')}`);
        const data = await res.json();

        Object.entries(data.results).forEach(([porta, status]) => {
          const botao = portaBotaoMap[porta];
          if (!botao) return;

          botao.classList.remove('borda-vermelha-piscando');
          if (!status) {
            botao.classList.add('borda-vermelha-piscando');
          } else {
            const originalColor = botao.style.backgroundColor;
            botao.style.transition = "box-shadow 0.3s";
            botao.style.boxShadow = "0 0 15px #00ff00";
            setTimeout(() => botao.style.boxShadow = "", 2000);
          }
        });
    } catch (err) {
        console.error("Erro ping:", err);
        showToast("Erro na API.");
    }
}

/* ============================================================
   LÓGICA DOS MODAIS (Dispositivos e Condomínios)
   ============================================================ */

// 1. Modal de DISPOSITIVOS (Adicionar/Editar dentro do card)
window.openDeviceModal = function(condId, device = null) {
  const modal = document.getElementById('deviceModal');
  const title = document.getElementById('modalTitle');
  const btnDelete = document.getElementById('btnDelete');
  
  document.getElementById('condominioId').value = condId;
  document.getElementById('devName').value = '';
  document.getElementById('devIp').value = '';
  document.getElementById('devPort').value = '';
  document.getElementById('oldDeviceName').value = ''; 

  if (device) {
    title.innerText = "Editar Dispositivo";
    document.getElementById('devName').value = device.Nome;
    document.getElementById('devIp').value = device.IP;
    document.getElementById('devPort').value = device.Porta;
    document.getElementById('oldDeviceName').value = device.Nome; 
    btnDelete.classList.remove('hidden');
  } else {
    title.innerText = "Adicionar Novo";
    btnDelete.classList.add('hidden');
  }
  modal.classList.add('open');
}

window.closeDeviceModal = function() {
  document.getElementById('deviceModal').classList.remove('open');
}

// Salvar Dispositivo
const deviceForm = document.getElementById('deviceForm');
if(deviceForm) {
    deviceForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const condId = document.getElementById('condominioId').value;
      const oldName = document.getElementById('oldDeviceName').value;
      
      const newDevice = {
        Nome: document.getElementById('devName').value,
        IP: document.getElementById('devIp').value,
        Porta: document.getElementById('devPort').value
      };

      try {
        const condominioIndex = listArr.findIndex(c => c.id === condId);
        if (condominioIndex === -1) return;

        let natArray = listArr[condominioIndex].nat || [];

        if (oldName) {
          const devIndex = natArray.findIndex(d => d.Nome === oldName);
          if (devIndex !== -1) natArray[devIndex] = newDevice;
        } else {
          natArray.push(newDevice);
        }

        await updateFirebase(condId, { nat: natArray });
        showToast("Salvo com sucesso!");
        closeDeviceModal();
        loadData(); 
      } catch (error) {
        console.error("Erro salvar dispositivo:", error);
        alert("Erro ao salvar.");
      }
    });
}

// Excluir Dispositivo
const btnDeleteDevice = document.getElementById('btnDelete');
if(btnDeleteDevice){
    btnDeleteDevice.addEventListener('click', async function() {
        const condId = document.getElementById('condominioId').value;
        const oldName = document.getElementById('oldDeviceName').value;

        if (!confirm(`Excluir "${oldName}"?`)) return;

        try {
            const condominioIndex = listArr.findIndex(c => c.id === condId);
            if (condominioIndex === -1) return;

            let natArray = listArr[condominioIndex].nat || [];
            const newNatArray = natArray.filter(d => d.Nome !== oldName);

            await updateFirebase(condId, { nat: newNatArray });
            showToast("Excluído!");
            closeDeviceModal();
            loadData();
        } catch(error) {
            console.error("Erro excluir:", error);
        }
    });
}


// 2. Modal de CONDOMÍNIOS (Botão "+" do Header)
window.openCondoModal = function() {
    document.getElementById('newCondoName').value = "";
    document.getElementById('newCondoDomain').value = "";
    document.getElementById('condoModal').classList.add('open');
}

window.closeCondoModal = function() {
    document.getElementById('condoModal').classList.remove('open');
}

const adderBtn = document.getElementById('adder');
if(adderBtn) {
    adderBtn.addEventListener('click', window.openCondoModal);
}

// Salvar Novo Condomínio
const condoForm = document.getElementById('condoForm');
if(condoForm) {
    condoForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const nome = document.getElementById('newCondoName').value;
        const dominio = document.getElementById('newCondoDomain').value;

        if(!nome || !dominio) {
            alert("Preencha todos os campos");
            return;
        }

        try {
            await addDoc(collection(db, "condominios"), {
                nome: nome,
                dominio: dominio,
                nat: [] 
            });

            showToast("Condomínio criado!");
            closeCondoModal();
            loadData(); 
        } catch(err) {
            console.error("Erro ao criar condomínio:", err);
            alert("Erro ao criar condomínio.");
        }
    });
}

// --- Helpers ---

async function updateFirebase(condId, dataObj) {
    const condRef = doc(db, "condominios", condId);
    await updateDoc(condRef, dataObj);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if(toast) {
      toast.innerText = message;
      toast.className = "show";
      setTimeout(() => toast.className = toast.className.replace("show", ""), 3000);
  } else {
      console.log(message);
  }
}

document.getElementById('search-bar').addEventListener("input", function() {
  const input = this.value.toLowerCase();
  const cards = document.getElementsByClassName('card');

  Array.from(cards).forEach((card) => {
    const name = card.getElementsByTagName('p')[0].textContent.toLowerCase();
    const buttonsText = Array.from(card.getElementsByTagName('button'))
                             .map(b => b.textContent.toLowerCase())
                             .join(' ');

    if (name.includes(input) || buttonsText.includes(input)) {
      card.style.display = 'flex'; 
    } else {
      card.style.display = 'none';
    }
  });
});

document.getElementById('eraser').addEventListener("click", function () {
  const input = document.getElementById('search-bar');
  input.value = "";
  input.dispatchEvent(new Event('input'));
  input.focus();
});

// Start
loadData();