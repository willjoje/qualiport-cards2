import { collection, getDocs, doc, updateDoc, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { db } from "./firebase.js";

// --- Variáveis Globais ---
let listArr = []; 
let useIpMap = {}; 

// --- Lógica do Dark Mode ---
const themeToggleBtn = document.getElementById('theme-toggle');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        
        // Salvar preferência
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });
}

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

    // --- CABEÇALHO DO CARD (Links de Internet) ---
    const headerRow = document.createElement("div");
    headerRow.className = "card-header-row";

    // Nome do Condomínio (Alinhado à esquerda)
    const nomeCondominio = document.createElement("p");
    nomeCondominio.innerText = condominio.nome;
    nomeCondominio.className = "card-title";
    headerRow.appendChild(nomeCondominio);

    // Container dos Botões de Link (Direita)
    const linksContainer = document.createElement("div");
    linksContainer.className = "links-badges-container";

    // Garante que o array de links tenha 2 posições ou cria
    const links = condominio.links || [null, null]; 
    // Segurança extra caso o array exista mas tenha tamanho errado
    while(links.length < 2) links.push(null);

    // Renderiza os dois slots (0 e 1)
    links.slice(0, 2).forEach((linkData, index) => {
        const linkBtn = document.createElement("button");
        linkBtn.className = "link-badge";
        
        if (linkData) {
            // Se existe link configurado
            // Exibe 5 letras como solicitado
            linkBtn.innerText = linkData.provider ? linkData.provider.substring(0, 5) : "Link"; 
            linkBtn.style.backgroundColor = linkData.color;
            linkBtn.title = `Operadora: ${linkData.provider}`;
            linkBtn.onclick = (e) => {
                e.stopPropagation(); // Evita conflitos de clique
                openLinkModal(condominio.id, index, linkData);
            };
        } else {
            // Se não existe (Botão Adicionar Vazio)
            linkBtn.innerText = "+";
            linkBtn.className += " empty";
            linkBtn.title = "Adicionar Link de Internet";
            linkBtn.onclick = (e) => {
                e.stopPropagation();
                openLinkModal(condominio.id, index, null);
            };
        }
        linksContainer.appendChild(linkBtn);
    });

    headerRow.appendChild(linksContainer);
    card.appendChild(headerRow);
    // -------------------------------------------

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

// --- Renderização de Botões de Dispositivos ---
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
    
    let url;
    if (useIp) {
        if (nome.includes("DVR") || nome.includes("NVR")) {
            url = `http://${dev.IP}:${dev.Porta}`;
        } else {
            url = `http://${dev.IP}`;
        }
    } else {
        url = `http://${condominio.dominio}:${dev.Porta}`;
    }

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
   LÓGICA DOS MODAIS (Links, Dispositivos e Condomínios)
   ============================================================ */

// --- FUNÇÃO AUXILIAR DE CÓPIA ---
window.copyField = function(elementId) {
    const input = document.getElementById(elementId);
    if(input && input.value) {
        navigator.clipboard.writeText(input.value);
        showToast("Copiado!");
    } else {
        showToast("Campo vazio.");
    }
}

// --- 1. MODAL DE LINKS DE INTERNET (FIXO / 4G) ---

// Início: Chamado pelo botão no Card
window.openLinkModal = function(condId, index, linkData) {
    // Se já existe dados (Edição), pulamos a seleção e abrimos direto
    if (linkData) {
        // Detecta o tipo baseado nos dados (se tiver 'mobileNum', é 4G)
        const type = linkData.type || (linkData.mobileNum ? 'mobile' : 'fixed');
        configureAndOpenMainModal(condId, index, type, linkData);
    } else {
        // Se é novo, abre a seleção de tipo
        document.getElementById('linkCondoId').value = condId;
        document.getElementById('linkIndex').value = index;
        document.getElementById('linkTypeModal').classList.add('open');
    }
}

// Fechar Seleção
window.closeTypeModal = function() {
    document.getElementById('linkTypeModal').classList.remove('open');
}

// Usuário escolheu o tipo (Fixo ou 4G)
window.selectLinkType = function(type) {
    const condId = document.getElementById('linkCondoId').value;
    const index = document.getElementById('linkIndex').value;
    
    closeTypeModal();
    // Abre o modal principal vazio configurado para o tipo escolhido
    configureAndOpenMainModal(condId, index, type, null);
}

// Configura e Mostra o Modal Principal
function configureAndOpenMainModal(condId, index, type, data) {
    const modal = document.getElementById('linkModal');
    const title = document.getElementById('linkModalTitle');
    const btnDelete = document.getElementById('btnDeleteLink');
    
    // Set Hidden Fields
    document.getElementById('linkCondoId').value = condId;
    document.getElementById('linkIndex').value = index;
    document.getElementById('linkType').value = type;

    // Elementos de UI
    const fieldsFixed = document.getElementById('fields-fixed');
    const fieldsMobile = document.getElementById('fields-mobile');
    const labelProvider = document.getElementById('labelProvider');

    // Resetar campos
    document.getElementById('linkProvider').value = '';
    // Fixed fields
    document.getElementById('color-blue').checked = true;
    document.getElementById('linkContract').value = '';
    document.getElementById('linkCnpj').value = '';
    document.getElementById('linkPass').value = '';
    // Mobile fields
    document.getElementById('linkMobileNum').value = '';
    document.getElementById('linkMobileGB').value = '';

    // CONFIGURAÇÃO VISUAL (FIXO vs 4G)
    if (type === 'mobile') {
        // Modo 4G
        title.innerText = data ? "Editar 4G" : "Novo Modem 4G";
        labelProvider.innerText = "Operadora"; 
        fieldsFixed.classList.add('hidden');
        fieldsMobile.classList.remove('hidden');
    } else {
        // Modo Internet Fixa
        title.innerText = data ? "Editar Link Fixo" : "Novo Link Fixo";
        labelProvider.innerText = "Operadora";
        fieldsFixed.classList.remove('hidden');
        fieldsMobile.classList.add('hidden');
    }

    // PREENCHER DADOS SE FOR EDIÇÃO
    if (data) {
        document.getElementById('linkProvider').value = data.provider;
        
        if (type === 'mobile') {
            document.getElementById('linkMobileNum').value = data.mobileNum || '';
            document.getElementById('linkMobileGB').value = data.gb || '';
        } else {
            // Cor (Seletor)
            const colorRadio = document.querySelector(`input[name="linkColorOption"][value="${data.color}"]`);
            if (colorRadio) colorRadio.checked = true;
            
            document.getElementById('linkContract').value = data.contract || '';
            document.getElementById('linkCnpj').value = data.cnpj || '';
            document.getElementById('linkPass').value = data.pass || '';
        }
        btnDelete.classList.remove('hidden');
    } else {
        btnDelete.classList.add('hidden');
    }

    modal.classList.add('open');
}

window.closeLinkModal = function() {
    document.getElementById('linkModal').classList.remove('open');
}

// Salvar (Lida com os dois tipos)
const linkForm = document.getElementById('linkForm');
if(linkForm) {
    linkForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const condId = document.getElementById('linkCondoId').value;
        const index = parseInt(document.getElementById('linkIndex').value);
        const type = document.getElementById('linkType').value;
        const providerName = document.getElementById('linkProvider').value;

        let newLink = {
            type: type,
            provider: providerName
        };

        if (type === 'mobile') {
            // SALVANDO 4G
            newLink.color = "#ff9800"; // Laranja Obrigatório
            newLink.mobileNum = document.getElementById('linkMobileNum').value;
            newLink.gb = document.getElementById('linkMobileGB').value;
            // Limpa campos irrelevantes para manter o banco limpo
        } else {
            // SALVANDO FIXO
            const selectedColor = document.querySelector('input[name="linkColorOption"]:checked').value;
            newLink.color = selectedColor;
            newLink.contract = document.getElementById('linkContract').value;
            newLink.cnpj = document.getElementById('linkCnpj').value;
            newLink.pass = document.getElementById('linkPass').value;
        }

        try {
            const condominioIndex = listArr.findIndex(c => c.id === condId);
            if (condominioIndex === -1) return;

            // Pega o array atual ou cria um novo
            let currentLinks = listArr[condominioIndex].links || [null, null];
            // Garante tamanho 2
            while(currentLinks.length < 2) currentLinks.push(null);
            
            // Atualiza o slot específico
            currentLinks[index] = newLink;

            await updateFirebase(condId, { links: currentLinks });
            showToast("Link salvo!");
            closeLinkModal();
            loadData();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            showToast("Erro ao salvar.");
        }
    });
}

// Excluir Link
const btnDeleteLink = document.getElementById('btnDeleteLink');
if(btnDeleteLink) {
    btnDeleteLink.addEventListener('click', async function() {
        if(!confirm("Tem certeza que deseja remover este link?")) return;

        const condId = document.getElementById('linkCondoId').value;
        const index = parseInt(document.getElementById('linkIndex').value);

        try {
            const condominioIndex = listArr.findIndex(c => c.id === condId);
            let currentLinks = listArr[condominioIndex].links || [null, null];

            // Define o slot como null para limpar, mas mantendo a posição
            currentLinks[index] = null;

            await updateFirebase(condId, { links: currentLinks });
            showToast("Link removido!");
            closeLinkModal();
            loadData();
        } catch(error) {
            console.error("Erro ao excluir link:", error);
            showToast("Erro ao excluir.");
        }
    });
}

// --- 2. MODAL DE DISPOSITIVOS (Adicionar/Editar dentro do card) ---
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


// --- 3. MODAL DE CONDOMÍNIOS (Botão "+" do Header) ---
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
            // --- LÓGICA DE ID SEQUENCIAL ---
            let maxId = 0;

            // Varre a lista atual para achar o maior número
            listArr.forEach(item => {
                // Tenta converter o ID para número (ignora IDs não numéricos como o aleatório que você criou)
                const currentId = parseInt(item.id);
                if (!isNaN(currentId) && currentId > maxId) {
                    maxId = currentId;
                }
            });

            // O próximo ID será o maior encontrado + 1
            const nextId = (maxId + 1).toString();
            // --------------------------------

            // Usa setDoc para definir o ID manualmente (nextId)
            await setDoc(doc(db, "condominios", nextId), {
                nome: nome,
                dominio: dominio,
                nat: [],
                links: [null, null] 
            });

            showToast(`Condomínio criado! ID: ${nextId}`);
            closeCondoModal();
            loadData(); 
        } catch(err) {
            console.error("Erro ao criar condomínio:", err);
            alert("Erro ao criar condomínio.");
        }
    });
}

/* ============================================================
   FUNÇÕES DE EXPORTAÇÃO
   ============================================================ */

function downloadFile(content, filename, mimeType) {
    const a = document.createElement('a');
    // Adiciona o BOM (\uFEFF) para garantir que o Excel abra UTF-8 corretamente
    const blob = new Blob(mimeType.includes('csv') ? ['\uFEFF' + content] : [content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
}

// 1. Exportar Lista de Nomes (.txt)
document.getElementById('btnExportNames')?.addEventListener('click', () => {
    if (!listArr || listArr.length === 0) {
        showToast("Sem dados para exportar.");
        return;
    }
    const names = listArr.map(c => c.nome).join('\n');
    downloadFile(names, 'lista_condominios_nomes.txt', 'text/plain');
});

// 2. Exportar Lista de Domínios (.txt)
document.getElementById('btnExportDomains')?.addEventListener('click', () => {
    if (!listArr || listArr.length === 0) {
        showToast("Sem dados para exportar.");
        return;
    }
    const domains = listArr.map(c => c.dominio).join('\n');
    downloadFile(domains, 'lista_condominios_dominios.txt', 'text/plain');
});

// 3. Exportar Banco de Dados Completo (.json)
document.getElementById('btnExportDB')?.addEventListener('click', () => {
    if (!listArr || listArr.length === 0) {
        showToast("Sem dados para exportar.");
        return;
    }
    const json = JSON.stringify(listArr, null, 4); 
    downloadFile(json, 'backup_banco_de_dados.json', 'application/json');
});

// 4. Exportar Tabela CSV (.csv)
document.getElementById('btnExportCSV')?.addEventListener('click', () => {
    if (!listArr || listArr.length === 0) {
        showToast("Sem dados para exportar.");
        return;
    }

    const headers = ["ID", "Condomínio", "Domínio", "Nome Dispositivo", "IP Interno", "Porta Externa", "Link 1", "Link 2"];
    let csvContent = headers.join(",") + "\n";

    listArr.forEach(cond => {
        // Formata string dos links para o CSV
        const l1 = cond.links && cond.links[0] ? `"${cond.links[0].provider}"` : "-";
        const l2 = cond.links && cond.links[1] ? `"${cond.links[1].provider}"` : "-";

        if (cond.nat && cond.nat.length > 0) {
            cond.nat.forEach(dev => {
                let row = [
                    `"${cond.id}"`,
                    `"${cond.nome}"`,
                    `"${cond.dominio}"`,
                    `"${dev.Nome}"`,
                    `"${dev.IP}"`,
                    `"${dev.Porta}"`,
                    l1,
                    l2
                ];
                csvContent += row.join(",") + "\n";
            });
        } else {
            let row = [
                `"${cond.id}"`,
                `"${cond.nome}"`,
                `"${cond.dominio}"`,
                "-",
                "-",
                "-",
                l1,
                l2
            ];
            csvContent += row.join(",") + "\n";
        }
    });

    downloadFile(csvContent, 'relatorio_geral.csv', 'text/csv;charset=utf-8;');
});


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