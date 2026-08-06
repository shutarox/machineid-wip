HISTCONTROL=ignoreboth

shopt -s histappend

PS1='${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '

alias ls='ls -F --color=auto'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'
eval "$(direnv hook bash)"
export PATH="$HOME/.local/bin:$PATH"
