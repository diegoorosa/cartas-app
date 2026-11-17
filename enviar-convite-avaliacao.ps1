#!/usr/bin/env pwsh
# =============================================================================
# SCRIPT LOCAL - Envio em lote de convite para avaliacao (CartasApp)
# =============================================================================
# O que faz:
#   1. Le a tabela generations do Supabase (compras desde 01/jul)
#   2. Exclui compras de teste do dono (diego.sch.rosa@ / diegosch.rosa@)
#   3. Agrupa por email unico (fica com o pedido mais recente de cada pessoa)
#   4. Monta o link de /avaliacao.html pre-preenchido (order_id, slug, email, nome)
#   5. Monta o corpo do email personalizado, refrescando a memoria da compra
#   6. Por default faz DRY-RUN: apenas mostra o que faria, NAO envia email
#
# COMO USAR:
#   .\enviar-convite-avaliacao.ps1 -Modo Teste   # mostra o que faria (sem enviar)
#   .\enviar-convite-avaliacao.ps1 -Modo Teste -EmailTeste diego@seuemail.com  # so pra voce
#   .\enviar-convite-avaliacao.ps1 -Modo Real    # dispara de verdade (preencha SMTP abaixo)
#
# Pre-requisito: a tabela reviews ja deve existir no Supabase
# (arquivo netlify/functions/migrations/001_create_reviews_table.sql)
# =============================================================================

[CmdletBinding()]
param(
    [ValidateSet('Teste','Real')]
    [string]$Modo = 'Teste',

    [string]$EmailTeste = '',
    [int]$DelayEntreEmails = 10
)

$ErrorActionPreference = 'Stop'

# -----------------------------------------------------------------------------
# 1. Carrega .env (se existir)
# -----------------------------------------------------------------------------
$envPath = Join-Path $PSScriptRoot '.env'
$envs = @{}
if (Test-Path $envPath) {
    Get-Content $envPath -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)$') {
            $envs[$matches[1]] = $matches[2].Trim().Trim('"')
        }
    }
} else {
    Write-Warning "Arquivo .env nao encontrado em $envPath."
}

$SUPABASE_URL   = $envs['SUPABASE_URL']
$SUPABASE_KEY   = $envs['SUPABASE_SERVICE_ROLE_KEY']
$EMAIL_HOST     = $envs['EMAIL_HOST']
$EMAIL_USER     = $envs['EMAIL_USER']
$EMAIL_PASS     = $envs['EMAIL_PASS']
$SITE_URL       = $envs['SITE_URL']

if (-not $SITE_URL) { $SITE_URL = 'https://www.cartasapp.com.br' }

if (-not $SUPABASE_URL -or -not $SUPABASE_KEY) {
    Write-Error "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao encontrados no .env. Abortando."
}

if ($Modo -eq 'Real') {
    if (-not $EMAIL_HOST -or -not $EMAIL_USER -or -not $EMAIL_PASS) {
        Write-Error "Modo Real requer EMAIL_HOST, EMAIL_USER e EMAIL_PASS no .env. Abortando."
    }
}

# -----------------------------------------------------------------------------
# 2. Busca generations no Supabase
# -----------------------------------------------------------------------------
Write-Host "`n=== Buscando generations no Supabase ===" -ForegroundColor Cyan
$headers = @{ apikey = $SUPABASE_KEY; Authorization = "Bearer $SUPABASE_KEY" }
$url = "$SUPABASE_URL/rest/v1/generations?select=input_json,created_at,order_id&order=created_at.asc"

try {
    $todos = Invoke-RestMethod -Uri $url -Headers $headers -Method GET
    Write-Host "Total de registros encontrados: $($todos.Count)" -ForegroundColor Green
} catch {
    Write-Error "Erro ao consultar Supabase: $($_.Exception.Message)"
}

# -----------------------------------------------------------------------------
# 3. Filtra testes do dono e agrupa por email unico (fica com o mais recente)
# -----------------------------------------------------------------------------
$testesDono = @('diego.sch.rosa@gmail.com', 'diegosch.rosa@gmail.com')

$reais = $todos | Where-Object {
    $email = if ($_.input_json) { $_.input_json.email } else { $null }
    $email -and ($testesDono -notcontains $email)
}

Write-Host "Após excluir testes do dono: $($reais.Count) registros" -ForegroundColor Green

$porEmail = $reais | Group-Object { $_.input_json.email } | ForEach-Object {
    $maisRecente = $_.Group | Sort-Object created_at | Select-Object -Last 1
    [pscustomobject]@{
        Email    = $_.Name
        OrderId  = $maisRecente.input_json.order_id
        Slug     = $maisRecente.input_json.slug
        Nome     = if ($maisRecente.input_json.nome) { $maisRecente.input_json.nome }
                  elseif ($maisRecente.input_json.resp1_nome) { $maisRecente.input_json.resp1_nome }
                  else { '' }
        Data     = $maisRecente.created_at
        TipoDoc  = $maisRecente.input_json.slug
    }
} | Sort-Object Data -Descending

if ($EmailTeste) {
    $porEmail = $porEmail | Where-Object { $_.Email -eq $EmailTeste }
    Write-Host "Modo teste: filtrado para '$EmailTeste' -> $($porEmail.Count) email(s)" -ForegroundColor Yellow
}

Write-Host "Emails unicos para processar: $($porEmail.Count)" -ForegroundColor Green
Write-Host "`nAmostra dos primeiros 5:" -ForegroundColor Cyan
$porEmail | Select-Object -First 5 | ForEach-Object {
    "  {0,-45} | {1,-20} | {2} | {3}" -f $_.Email, $_.TipoDoc, $_.Data.Substring(0,10), $_.Nome
}

# -----------------------------------------------------------------------------
# 4. Mapeia slug -> descricao amigavel do documento
# -----------------------------------------------------------------------------
function Get-DescricaoDoc($slug) {
    switch -regex ($slug) {
        'autorizacao-viagem-menor' { return 'autorizacao de viagem para menor' }
        'carta-cancelamento-smart-fit' { return 'carta de cancelamento da Smart Fit' }
        'carta-cancelamento-bluefit' { return 'carta de cancelamento da Bluefit' }
        'carta-cancelamento-academia' { return 'carta de cancelamento de academia' }
        'carta-cancelamento-curso-presencial' { return 'carta de cancelamento de curso presencial' }
        'carta-reclamacao' { return 'carta de reclamacao' }
        'reembolso-cancelamento-passagem' { return 'pedido de reembolso de passagem aerea' }
        'carta-bagagem' { return 'carta de bagagem extraviada ou danificada' }
        default { return 'documento gerado no CartasApp' }
    }
}

# -----------------------------------------------------------------------------
# 5. Monta o corpo do email (HTML)
# -----------------------------------------------------------------------------
function Montar-CorpoEmail($nome, $descricaoDoc, $orderId, $slug, $emailCliente) {
    $saudacao = if ($nome) { "Ola, $nome" } else { "Ola" }
    
    $reviewLink = "$SITE_URL/avaliacao.html?order_id=$orderId&slug=$slug&email=$emailCliente"
    if ($nome) { $reviewLink += "&nome=$nome" }
    
    $reviewLinkEncoded = [System.Uri]::EscapeUriString($reviewLink)

    return @"
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td align="center" style="padding-bottom: 24px;">
        <img src="$SITE_URL/logo.png" alt="CartasApp" width="72" style="display: block;"/>
      </td>
    </tr>
    <tr>
      <td style="font-size: 20px; font-weight: 700; color: #14213D; text-align: center; padding-bottom: 16px;">
        Sua compra no CartasApp - conte como foi
      </td>
    </tr>
    <tr>
      <td style="font-size: 15px; color: #4A5568;">
        <p>$saudacao,</p>
        <p>
          Ha algum tempo voce gerou no CartasApp um <strong>$descricaoDoc</strong> (pedido <strong>$orderId</strong>).
          Como ja passou um tempo, pode ser que nao lembre exatamente - entao vamos direto ao ponto:
        </p>
        <p>
          <strong>Sua experiencia foi tranquila?</strong> O documento serviu para o que voce precisava?
          Se voce puder dedicar <strong>menos de 1 minuto</strong> para nos avaliar, ajuda muito outras pessoas
          que estao passando pela mesma situacao.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
          <tr>
            <td align="center">
              <a href="$reviewLinkEncoded" style="
                background: #2563eb; color: #fff; padding: 14px 28px;
                text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px;
                display: inline-block;">
                Estrela minha avaliacao (1 minuto)
              </a>
            </td>
          </tr>
        </table>
        <p style="font-size: 14px; color: #718096;">
          Voce vai poder escolher de 1 a 5 estrelas e, se quiser, deixar um comentario.<br>
          Sua avaliacao aparece como depoimento real no site, apos moderacao pela nossa equipe.
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="font-size: 12px; color: #a0aec0;">
          Se esse email chegou por engano ou voce nao deseja mais receber contatos do CartasApp,<br>
          basta responder esta mensagem que removemos seu contato.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"@
}

# -----------------------------------------------------------------------------
# 6. Exibe o que seria enviado (dry-run) OU envia de verdade (modo Real)
# -----------------------------------------------------------------------------
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "MODO: $Modo  |  Total de emails: $($porEmail.Count)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$enviados = 0
$ignorados = 0

foreach ($item in $porEmail) {
    $email = $item.Email
    $descricao = Get-DescricaoDoc -slug $item.Slug
    $nome = $item.Nome
    
    $reviewLink = "$SITE_URL/avaliacao.html?order_id=$($item.OrderId)&slug=$($item.Slug)&email=$email"
    if ($nome) { $reviewLink += "&nome=$nome" }
    
    $corpo = Montar-CorpoEmail -nome $nome -descricaoDoc $descricao -orderId $item.OrderId -slug $item.Slug -emailCliente $email
    
    Write-Host "------------------------------------------------------------"
    Write-Host "EMAIL: $email" -ForegroundColor Yellow
    Write-Host "  Pedido : $($item.OrderId)"
    Write-Host "  Documento: $descricao ($($item.Slug))"
    Write-Host "  Nome   : $nome"
    Write-Host "  Data   : $($item.Data.Substring(0,10))"
    Write-Host "  Link   : $reviewLink"
    
    if ($Modo -eq 'Real') {
        try {
            $mensagem = New-Object System.Net.Mail.MailMessage
            $mensagem.From = $EMAIL_USER
            $mensagem.To.Add($email)
            $mensagem.Subject = "Sua compra no CartasApp - conte como foi"
            $mensagem.IsBodyHtml = $true
            $mensagem.Body = $corpo
            
            $cliente = New-Object System.Net.Mail.SmtpClient($EMAIL_HOST, 465)
            $cliente.EnableSsl = $true
            $cliente.Credentials = New-Object System.Net.NetworkCredential($EMAIL_USER, $EMAIL_PASS)
            
            $cliente.Send($mensagem)
            $enviados++
            Write-Host "  -> ENVIADO com sucesso" -ForegroundColor Green
        } catch {
            Write-Host "  -> ERRO ao enviar: $($_.Exception.Message)" -ForegroundColor Red
            $ignorados++
        }
        
        if ($enviados -lt $porEmail.Count) {
            Write-Host "  (aguardando $DelayEntreEmails segundos antes do proximo...)" -ForegroundColor DarkGray
            Start-Sleep -Seconds $DelayEntreEmails
        }
    } else {
        Write-Host "  -> [DRY-RUN] nao enviado" -ForegroundColor Gray
    }
}

Write-Host "`n========================================================" -ForegroundColor Cyan
if ($Modo -eq 'Real') {
    Write-Host "ENVIADOS: $enviados   |   FALHARAM: $ignorados   |   TOTAL: $($porEmail.Count)" -ForegroundColor Green
} else {
    Write-Host "DRY-RUN concluido. Nenhum email foi enviado." -ForegroundColor Yellow
    Write-Host "Para enviar de verdade, rode com: .\enviar-convite-avaliacao.ps1 -Modo Real" -ForegroundColor Yellow
}
Write-Host "========================================================" -ForegroundColor Cyan
