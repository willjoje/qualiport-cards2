import { collection, getDocs, doc, updateDoc, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { db } from "./firebase.js";

// --- CONFIGURAÇÃO DA API LOCAL (TÚNEL CLOUDFLARE) ---
const LOCAL_API_URL = "https://ottawa-roll-submitted-necessarily.trycloudflare.com"; 

// --- Variáveis Globais ---
let listArr = []; 
let useIpMap = {}; 

// --- Lógica do Dark Mode ---
const themeToggleBtn = document.getElementById('theme-toggle');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
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
    applyFilter(); 

  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    showToast("Erro ao carregar dados.");
  }
}

// --- Criação dos Cards ---
function createCards(lista) {
  let cardContainer = document.getElementById("card-container");
  cardContainer.innerHTML = "";

  lista.sort((a, b) => a.nome.localeCompare(b.nome));

  lista.forEach((condominio) => {
    let card = document.createElement("div");
    card.className = "card";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.alignItems = "center";

    // --- CABEÇALHO DO CARD (Links) ---
    const headerRow = document.createElement("div");
    headerRow.className = "card-header-row";

    const nomeCondominio = document.createElement("p");
    nomeCondominio.innerText = condominio.nome;
    nomeCondominio.className = "card-title";
    headerRow.appendChild(nomeCondominio);

    const linksContainer = document.createElement("div");
    linksContainer.className = "links-badges-container";

    const links = condominio.links || [null, null]; 
    while(links.length < 2) links.push(null);

    links.slice(0, 2).forEach((linkData, index) => {
        const linkBtn = document.createElement("button");
        linkBtn.className = "link-badge";
        
        if (linkData) {
            linkBtn.innerText = linkData.provider ? linkData.provider.substring(0, 5) : "Link"; 
            linkBtn.style.backgroundColor = linkData.color;
            linkBtn.title = `Operadora: ${linkData.provider}`;
            linkBtn.onclick = (e) => {
                e.stopPropagation();
                openLinkModal(condominio.id, index, linkData);
            };
        } else {
            linkBtn.innerText = "+";
            linkBtn.className += " empty";
            linkBtn.title = "Adicionar Link";
            linkBtn.onclick = (e) => {
                e.stopPropagation();
                openLinkModal(condominio.id, index, null);
            };
        }
        linksContainer.appendChild(linkBtn);
    });

    headerRow.appendChild(linksContainer);
    card.appendChild(headerRow);

    if (useIpMap[condominio.id] === undefined) {
      useIpMap[condominio.id] = false;
    }

    const devicesContainer = document.createElement("div");
    devicesContainer.className = "devices-container"; 
    devicesContainer.id = `devices-${condominio.id}`;
    
    const toggleButton = document.createElement("button");
    toggleButton.innerText = useIpMap[condominio.id] ? "Usar Domínio" : "Usar IP";
    toggleButton.className = "toggleButton";
    toggleButton.addEventListener("click", function () {
      useIpMap[condominio.id] = !useIpMap[condominio.id];
      toggleButton.innerText = useIpMap[condominio.id] ? "Usar Domínio" : "Usar IP";
      renderDeviceButtons(condominio, card, devicesContainer);
    });
    card.appendChild(toggleButton);

    const testButton = document.createElement("button");
    testButton.innerText = "Teste";
    testButton.className = "testButton";
    testButton.addEventListener("click", () => runPingTest(condominio, devicesContainer));
    card.appendChild(testButton);

    card.appendChild(devicesContainer);
    renderDeviceButtons(condominio, card, devicesContainer);

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

// --- Renderização de Botões (COM TEXTO DE STATUS EMBAIXO) ---
function renderDeviceButtons(condominio, card, container) {
  container.innerHTML = "";
  const useIp = useIpMap[condominio.id];

  const createWrapper = (label, url, originalDevice, bgColor) => {
      // 1. Container Vertical
      const outerContainer = document.createElement("div");
      outerContainer.className = "device-outer-container";

      // 2. Wrapper dos Botões
      const wrapper = document.createElement("div");
      wrapper.className = "device-wrapper";

      const btn = document.createElement("button");
      btn.innerText = label;
      btn.className = "button";
      btn.style.backgroundColor = bgColor;
      
      if(originalDevice) {
          if(originalDevice.Porta) btn.dataset.porta = originalDevice.Porta;
          if(originalDevice.IP) btn.dataset.ip = originalDevice.IP;
      }

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

      // 3. Texto de UPTIME/DOWNTIME (Novo)
      const statusText = document.createElement("span");
      statusText.className = "device-status-text";
      statusText.style.display = "none";
      statusText.innerText = "";

      outerContainer.appendChild(wrapper);
      outerContainer.appendChild(statusText);

      return outerContainer;
  };

  if (condominio.nat) {
      const mk = condominio.nat.find(d => d.Nome.toLowerCase().includes("mikrotik"));
      if (mk && !mk.Porta.includes("7890")) {
          const url = useIp ? `${mk.IP}:${mk.Porta}` : `${condominio.dominio}:${mk.Porta}`;
          const color = useIp ? "#5e2a8a" : "#6666cc";
          container.appendChild(createWrapper("Mikrotik", url, mk, color));
      }
  }

  if (!condominio.nat) return;

  condominio.nat.forEach((dev) => {
    const nome = dev.Nome.toUpperCase();
    const porta = dev.Porta;

    if (nome.includes("ATA") && porta !== "8889" && porta !== "8887") return;
    if (nome.includes("GUARITA") && porta !== "8093") return;
    if (nome.includes("MASQUERADE")) return;
    if (porta.includes("7890")) return;

    const color = useIp ? "#0277bd" : "#4caf50";
    
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

// --- PING TEST INTELIGENTE (UPTIME + DOWNTIME) ---
// Substitua a função runPingTest inteira por esta:
async function runPingTest(condominio, devicesContainer) {
    const useIp = useIpMap[condominio.id];
    // Seleciona os botões dentro do container
    const botoes = devicesContainer.querySelectorAll(".button");
    const devices = [];

    botoes.forEach((btn) => {
        let porta = btn.dataset.porta;
        let ip = btn.dataset.ip;

        // Fallback: Se não tem IP no botão, tenta achar no objeto do condomínio
        if (!ip && porta && condominio.nat) {
             const found = condominio.nat.find(d => d.Porta === porta);
             if(found) ip = found.IP;
        }

        // Acha o elemento de texto (span) que está logo abaixo do botão
        const containerPai = btn.closest('.device-outer-container');
        const textElement = containerPai ? containerPai.querySelector('.device-status-text') : null;

        if (porta) {
            devices.push({
                element: btn,
                textElement: textElement,
                ip: ip,
                porta: porta
            });
        }
    });

    if (devices.length === 0) {
        showToast("Nenhum dispositivo mapeado.");
        return;
    }

    if (useIp) {
        // --- MODO IP INTERNO (API UNIFI) ---
        let controllerIp = null;
        // Pega o IP do Mikrotik para saber qual controlador chamar
        if (condominio.nat) {
            const gatewayDev = condominio.nat.find(d => d.Nome && d.Nome.toUpperCase().includes("MIKROTIK"));
            if (gatewayDev) controllerIp = gatewayDev.IP;
        }

        if (!controllerIp) {
            showToast("Erro: IP do Mikrotik não encontrado.");
            return;
        }

        showToast(`Consultando UniFi (${controllerIp})...`);
        const listaIps = devices.filter(d => d.ip).map(d => d.ip);

        try {
            const response = await fetch(`${LOCAL_API_URL}/verificar-clientes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    ips: listaIps,
                    controllerIp: controllerIp 
                })
            });

            const data = await response.json();

            if (data.success) {
                devices.forEach(dev => {
                    if(dev.ip) {
                        const result = data.resultados[dev.ip];
                        
                        let isOnline = false;
                        let uptime = 0;
                        let lastSeen = null;

                        // Extrai os dados do objeto retornado pelo backend
                        if (typeof result === 'object' && result !== null) {
                            isOnline = !!result.online;
                            uptime = result.uptime || 0;     // Tempo ligado em segundos
                            lastSeen = result.last_seen;     // Data da última vez visto (timestamp)
                        } else {
                            isOnline = !!result;
                        }

                        // Atualiza a cor do botão (Piscar vermelho ou ficar verde)
                        applyVisualStatus(dev.element, isOnline);

                        // --- AQUI ESTÁ A MÁGICA DOS TEXTOS ---
                        if (dev.textElement) {
                            dev.textElement.style.display = "block";
                            
                            if (isOnline) {
                                // ONLINE (Texto Verde)
                                dev.textElement.classList.remove('status-offline');
                                dev.textElement.classList.add('status-online');
                                
                                if (uptime > 60) { // Só mostra tempo se for maior que 1 minuto
                                    dev.textElement.innerText = "Up: " + formatDuration(uptime);
                                } else {
                                    // Se vier 0 ou muito baixo, mostra só Online para não confundir
                                    dev.textElement.innerText = "Online";
                                }

                            } else {
                                // SE TÁ OFFLINE: Mostra quanto tempo caiu
                                dev.textElement.className = "device-status-text status-offline"; // Cor Vermelha
                                
                                if (lastSeen) {
                                    const now = Math.floor(Date.now() / 1000);
                                    const secondsOffline = now - lastSeen;
                                    dev.textElement.innerText = "Down: " + formatDuration(secondsOffline);
                                } else {
                                    // Se last_seen for null, é pq o UniFi já apagou do histórico ou nunca viu
                                    dev.textElement.innerText = "Down: ∞"; 
                                }
                            }
                        }
                    }
                });
                showToast("Status atualizado!");
            } else {
                showToast("Erro API: " + (data.error || "Desconhecido"));
            }
        } catch (error) {
            console.error(error);
            showToast("Falha na conexão.");
        }
    } else {
        // --- MODO DOMÍNIO EXTERNO (MANTIDO IGUAL) ---
        showToast("Testando porta externa...");
        const dominio = condominio.dominio;
        const portas = devices.map(d => d.porta);

        try {
            const res = await fetch(`https://ping-api-fqks.onrender.com/ping?dominio=${dominio}&portas=${portas.join(',')}`);
            const data = await res.json();

            devices.forEach(dev => {
                const isOnline = data.results[dev.porta];
                applyVisualStatus(dev.element, isOnline);
                // No modo externo não temos uptime, então esconde o texto
                if(dev.textElement) dev.textElement.style.display = "none";
            });
        } catch (err) {
            console.error("Erro ping externo:", err);
            showToast("Erro na API Externa.");
        }
    }
}

// --- FUNÇÃO FORMATAÇÃO (Segundos -> Dias/Horas) ---
function formatDuration(seconds) {
    if (!seconds || seconds < 0) return "0m";

    if (seconds < 60) return "agora";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function applyVisualStatus(btnElement, isOnline) {
    btnElement.classList.remove('borda-vermelha-piscando');
    
    if (!isOnline) {
        btnElement.classList.add('borda-vermelha-piscando');
    } else {
        const originalTransition = btnElement.style.transition;
        const originalBoxShadow = btnElement.style.boxShadow;
        
        btnElement.style.transition = "box-shadow 0.3s, transform 0.2s";
        btnElement.style.boxShadow = "0 0 20px #00ff00"; 
        btnElement.style.transform = "scale(1.05)";
        
        setTimeout(() => {
            btnElement.style.boxShadow = originalBoxShadow;
            btnElement.style.transform = "";
            btnElement.style.transition = originalTransition;
        }, 2000);
    }
}

// --- PING RÁPIDO (Search & Ping Interno) ---
const btnQuickPing = document.getElementById('btn-quick-ping');
const inputQuickPing = document.getElementById('quick-ping-input');

if (btnQuickPing && inputQuickPing) {
    inputQuickPing.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') btnQuickPing.click();
    });

    btnQuickPing.addEventListener('click', async () => {
        let targetIp = inputQuickPing.value.trim();
        if (targetIp.includes(":")) {
            targetIp = targetIp.split(":")[0];
        }
        
        if (!targetIp) {
            showToast("⚠️ Digite um IP interno.");
            return;
        }

        let foundCondo = null;
        let foundDeviceName = "Dispositivo";

        for (const condo of listArr) {
            if (condo.nat) {
                const dev = condo.nat.find(d => d.IP === targetIp);
                if (dev) {
                    foundCondo = condo;
                    foundDeviceName = dev.Nome;
                    break;
                }
            }
        }

        if (!foundCondo) {
            showToast("❌ IP não encontrado nos cadastros.");
            return;
        }

        let controllerIp = null;
        const gatewayDev = foundCondo.nat.find(d => d.Nome && d.Nome.toUpperCase().includes("MIKROTIK"));
        if (gatewayDev) controllerIp = gatewayDev.IP;

        if (!controllerIp) {
            showToast(`⚠️ ${foundCondo.nome} sem Gateway definido.`);
            return;
        }

        const originalText = btnQuickPing.innerText;
        btnQuickPing.innerText = "⏳";
        btnQuickPing.disabled = true;
        showToast(`Testando ${foundDeviceName}...`);

        try {
            const response = await fetch(`${LOCAL_API_URL}/verificar-clientes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    ips: [targetIp], 
                    controllerIp: controllerIp 
                })
            });

            const data = await response.json();

            if (data.success) {
                const result = data.resultados[targetIp];
                let isOnline = false;
                if (typeof result === 'object' && result !== null) {
                    isOnline = !!result.online;
                } else {
                    isOnline = !!result;
                }
                
                if (isOnline) {
                    showToast(`✅ ${foundDeviceName} está ONLINE!`);
                    inputQuickPing.style.color = "#4caf50";
                } else {
                    showToast(`🔻 ${foundDeviceName} está OFFLINE.`);
                    inputQuickPing.style.color = "#f44336";
                }
                setTimeout(() => { inputQuickPing.style.color = ""; }, 3000);

            } else {
                showToast("Erro API: " + (data.error || "Desconhecido"));
            }

        } catch (error) {
            console.error("Erro Ping Rápido:", error);
            showToast("Falha na conexão local.");
        } finally {
            btnQuickPing.innerText = originalText;
            btnQuickPing.disabled = false;
        }
    });
}


// --- LÓGICA DO BOTÃO DE TESTE GLOBAL ---
const btnGlobal = document.getElementById('btn-global-test');

// 1. TESTAR TUDO POR IP
const btnGlobalIp = document.getElementById('btn-global-ip');
if (btnGlobalIp) {
    btnGlobalIp.addEventListener('click', async function() {
        if(!confirm("Iniciar teste em massa via IP INTERNO (VPN)?")) return;
        showToast("Iniciando varredura por IP... 🚀");
        await runGlobalTest(true); 
    });
}

// 2. TESTAR TUDO POR DOMÍNIO
const btnGlobalDomain = document.getElementById('btn-global-domain');
if (btnGlobalDomain) {
    btnGlobalDomain.addEventListener('click', async function() {
        if(!confirm("Iniciar teste em massa via DOMÍNIO EXTERNO?")) return;
        showToast("Iniciando varredura por Domínio... 🌐");
        await runGlobalTest(false);
    });
}

async function runGlobalTest(forceIpMode) {
    let testados = 0;
    for (const condominio of listArr) {
        const containerNaTela = document.getElementById(`devices-${condominio.id}`);
        if (containerNaTela) {
            const cardPai = containerNaTela.closest('.card');
            if (cardPai && cardPai.style.display === 'none') continue; 

            testados++;
            useIpMap[condominio.id] = forceIpMode;
            
            const toggleBtn = cardPai.querySelector('.toggleButton');
            if(toggleBtn) {
                toggleBtn.innerText = forceIpMode ? "Usar Domínio" : "Usar IP";
                renderDeviceButtons(condominio, cardPai, containerNaTela);
            }

            try {
                showToast(`Testando: ${condominio.nome}...`);
                await runPingTest(condominio, containerNaTela);
                await new Promise(r => setTimeout(r, 500)); 
            } catch (err) {
                console.error(`Erro ao testar ${condominio.nome}`, err);
            }
        }
    }
    if (testados === 0) showToast("⚠️ Nenhum condomínio visível.");
    else showToast(`✅ Finalizado! ${testados} testados.`);
}

// --- MODAIS E HELPERS (Mantidos) ---
window.copyField = function(elementId) {
    const input = document.getElementById(elementId);
    if(input && input.value) {
        navigator.clipboard.writeText(input.value);
        showToast("Copiado!");
    }
}
window.openLinkModal = function(condId, index, linkData) {
    if (linkData) {
        const type = linkData.type || (linkData.mobileNum ? 'mobile' : 'fixed');
        configureAndOpenMainModal(condId, index, type, linkData);
    } else {
        document.getElementById('linkCondoId').value = condId;
        document.getElementById('linkIndex').value = index;
        document.getElementById('linkTypeModal').classList.add('open');
    }
}
window.closeTypeModal = function() { document.getElementById('linkTypeModal').classList.remove('open'); }
window.selectLinkType = function(type) {
    const condId = document.getElementById('linkCondoId').value;
    const index = document.getElementById('linkIndex').value;
    closeTypeModal();
    configureAndOpenMainModal(condId, index, type, null);
}
function configureAndOpenMainModal(condId, index, type, data) {
    const modal = document.getElementById('linkModal');
    const title = document.getElementById('linkModalTitle');
    const btnDelete = document.getElementById('btnDeleteLink');
    
    document.getElementById('linkCondoId').value = condId;
    document.getElementById('linkIndex').value = index;
    document.getElementById('linkType').value = type;

    const fieldsFixed = document.getElementById('fields-fixed');
    const fieldsMobile = document.getElementById('fields-mobile');
    const labelProvider = document.getElementById('labelProvider');

    document.getElementById('linkProvider').value = '';
    document.getElementById('color-blue').checked = true;
    document.getElementById('linkContract').value = '';
    document.getElementById('linkCnpj').value = '';
    document.getElementById('linkPass').value = '';
    document.getElementById('linkMobileNum').value = '';
    document.getElementById('linkMobileGB').value = '';

    if (type === 'mobile') {
        title.innerText = data ? "Editar 4G" : "Novo Modem 4G";
        labelProvider.innerText = "Operadora"; 
        fieldsFixed.classList.add('hidden');
        fieldsMobile.classList.remove('hidden');
    } else {
        title.innerText = data ? "Editar Link Fixo" : "Novo Link Fixo";
        labelProvider.innerText = "Operadora";
        fieldsFixed.classList.remove('hidden');
        fieldsMobile.classList.add('hidden');
    }

    if (data) {
        document.getElementById('linkProvider').value = data.provider;
        if (type === 'mobile') {
            document.getElementById('linkMobileNum').value = data.mobileNum || '';
            document.getElementById('linkMobileGB').value = data.gb || '';
        } else {
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
window.closeLinkModal = function() { document.getElementById('linkModal').classList.remove('open'); }

const linkForm = document.getElementById('linkForm');
if(linkForm) {
    linkForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const condId = document.getElementById('linkCondoId').value;
        const index = parseInt(document.getElementById('linkIndex').value);
        const type = document.getElementById('linkType').value;
        const providerName = document.getElementById('linkProvider').value;

        let newLink = { type: type, provider: providerName };

        if (type === 'mobile') {
            newLink.color = "#ff9800"; 
            newLink.mobileNum = document.getElementById('linkMobileNum').value;
            newLink.gb = document.getElementById('linkMobileGB').value;
        } else {
            newLink.color = document.querySelector('input[name="linkColorOption"]:checked').value;
            newLink.contract = document.getElementById('linkContract').value;
            newLink.cnpj = document.getElementById('linkCnpj').value;
            newLink.pass = document.getElementById('linkPass').value;
        }

        try {
            const condominioIndex = listArr.findIndex(c => c.id === condId);
            if (condominioIndex === -1) return;
            let currentLinks = listArr[condominioIndex].links || [null, null];
            while(currentLinks.length < 2) currentLinks.push(null);
            currentLinks[index] = newLink;
            await updateFirebase(condId, { links: currentLinks });
            showToast("Link salvo!");
            closeLinkModal();
            loadData();
        } catch (error) { console.error(error); showToast("Erro ao salvar."); }
    });
}

const btnDeleteLink = document.getElementById('btnDeleteLink');
if(btnDeleteLink) {
    btnDeleteLink.addEventListener('click', async function() {
        if(!confirm("Remover link?")) return;
        const condId = document.getElementById('linkCondoId').value;
        const index = parseInt(document.getElementById('linkIndex').value);
        try {
            const condominioIndex = listArr.findIndex(c => c.id === condId);
            let currentLinks = listArr[condominioIndex].links || [null, null];
            currentLinks[index] = null;
            await updateFirebase(condId, { links: currentLinks });
            showToast("Removido!");
            closeLinkModal();
            loadData();
        } catch(error) { console.error(error); }
    });
}

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
window.closeDeviceModal = function() { document.getElementById('deviceModal').classList.remove('open'); }

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
        } else { natArray.push(newDevice); }
        await updateFirebase(condId, { nat: natArray });
        showToast("Salvo!");
        closeDeviceModal();
        loadData(); 
      } catch (error) { console.error(error); }
    });
}

const btnDeleteDevice = document.getElementById('btnDelete');
if(btnDeleteDevice){
    btnDeleteDevice.addEventListener('click', async function() {
        const condId = document.getElementById('condominioId').value;
        const oldName = document.getElementById('oldDeviceName').value;
        if (!confirm(`Excluir "${oldName}"?`)) return;
        try {
            const condominioIndex = listArr.findIndex(c => c.id === condId);
            let natArray = listArr[condominioIndex].nat || [];
            const newNatArray = natArray.filter(d => d.Nome !== oldName);
            await updateFirebase(condId, { nat: newNatArray });
            showToast("Excluído!");
            closeDeviceModal();
            loadData();
        } catch(error) { console.error(error); }
    });
}

window.openCondoModal = function() {
    document.getElementById('newCondoName').value = "";
    document.getElementById('newCondoDomain').value = "";
    document.getElementById('condoModal').classList.add('open');
}
window.closeCondoModal = function() { document.getElementById('condoModal').classList.remove('open'); }
document.getElementById('adder')?.addEventListener('click', window.openCondoModal);

const condoForm = document.getElementById('condoForm');
if(condoForm) {
    condoForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const nome = document.getElementById('newCondoName').value;
        const dominio = document.getElementById('newCondoDomain').value;
        if(!nome || !dominio) { alert("Preencha todos os campos"); return; }
        try {
            let maxId = 0;
            listArr.forEach(item => {
                const currentId = parseInt(item.id);
                if (!isNaN(currentId) && currentId > maxId) maxId = currentId;
            });
            const nextId = (maxId + 1).toString();
            await setDoc(doc(db, "condominios", nextId), {
                nome: nome,
                dominio: dominio,
                nat: [],
                links: [null, null]
            });
            showToast(`Criado ID: ${nextId}`);
            closeCondoModal();
            loadData(); 
        } catch(err) { console.error(err); }
    });
}

function downloadFile(content, filename, mimeType) {
    const a = document.createElement('a');
    const blob = new Blob(mimeType.includes('csv') ? ['\uFEFF' + content] : [content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 0);
}
document.getElementById('btnExportNames')?.addEventListener('click', () => {
    if (!listArr.length) return;
    downloadFile(listArr.map(c => c.nome).join('\n'), 'lista_nomes.txt', 'text/plain');
});
document.getElementById('btnExportDomains')?.addEventListener('click', () => {
    if (!listArr.length) return;
    downloadFile(listArr.map(c => c.dominio).join('\n'), 'lista_dominios.txt', 'text/plain');
});
document.getElementById('btnExportDB')?.addEventListener('click', () => {
    if (!listArr.length) return;
    downloadFile(JSON.stringify(listArr, null, 4), 'backup.json', 'application/json');
});
document.getElementById('btnExportCSV')?.addEventListener('click', () => {
    if (!listArr.length) return;
    const headers = ["ID", "Condomínio", "Domínio", "Nome Dispositivo", "IP Interno", "Porta Externa", "Link 1", "Link 2"];
    let csvContent = headers.join(",") + "\n";
    listArr.forEach(cond => {
        const l1 = cond.links && cond.links[0] ? `"${cond.links[0].provider}"` : "-";
        const l2 = cond.links && cond.links[1] ? `"${cond.links[1].provider}"` : "-";
        if (cond.nat && cond.nat.length > 0) {
            cond.nat.forEach(dev => {
                let row = [`"${cond.id}"`, `"${cond.nome}"`, `"${cond.dominio}"`, `"${dev.Nome}"`, `"${dev.IP}"`, `"${dev.Porta}"`, l1, l2];
                csvContent += row.join(",") + "\n";
            });
        } else {
            let row = [`"${cond.id}"`, `"${cond.nome}"`, `"${cond.dominio}"`, "-", "-", "-", l1, l2];
            csvContent += row.join(",") + "\n";
        }
    });
    downloadFile(csvContent, 'relatorio.csv', 'text/csv;charset=utf-8;');
});

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
  }
}
function applyFilter() {
  const input = document.getElementById('search-bar').value.toLowerCase();
  const cards = document.getElementsByClassName('card');
  Array.from(cards).forEach((card) => {
    const name = card.getElementsByTagName('p')[0].textContent.toLowerCase();
    const buttonsText = Array.from(card.getElementsByTagName('button')).map(b => b.textContent.toLowerCase()).join(' ');
    if (name.includes(input) || buttonsText.includes(input)) {
      card.style.display = 'flex'; 
    } else {
      card.style.display = 'none';
    }
  });
}
document.getElementById('search-bar').addEventListener("input", applyFilter);
document.getElementById('eraser').addEventListener("click", function () {
  const input = document.getElementById('search-bar');
  input.value = "";
  input.dispatchEvent(new Event('input'));
  input.focus();
});

loadData();