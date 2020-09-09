import React, {useState,useEffect} from 'react';
import './App.css';

import { ApolloProvider, useMutation, useQuery } from 'react-apollo'
import { ApolloClient } from 'apollo-client'
import { WebSocketLink } from "apollo-link-ws"
import { InMemoryCache } from 'apollo-cache-inmemory'
import gql from "graphql-tag"
import axios from 'axios'

const URL_TRANSLATOR = process.env.REACT_APP_URL_TRANSLATOR || 'http://localhost:5000/t'

const READ_CONTENT = gql`
  query ($id: String, $playPublicId: String) {
    content(id: $id, playPublicId: $playPublicId) {
        id
        actions {
            id
            text
        }
    }
  }
`

const CREATE_ADVENTURE = gql`
  mutation ($id: String, $prompt: String) {  
    createAdventureFromScenarioId(id: $id, prompt: $prompt) {    
      id    contentType    contentId    title    description    musicTheme    tags    nsfw    published    createdAt    updatedAt    deletedAt    publicId    historyList    __typename  
    }
  }
`

const SEND_ACTION = gql`
  mutation ($input: ContentActionInput) {  
    sendAction(input: $input) {    
      id    actionLoading    memory    died    gameState    __typename  
    }
  }
`

const ALTER = gql`
  mutation ($input: ContentActionInput) {  
    doAlterAction(input: $input) {    
      id    
      actions {      
        id      text      
      }    
      __typename 
    }
  }  
`

const SETTINGS = gql`
  mutation ($input: GameSettingsInput) {  
    saveGameSettings(input: $input) {    
      id    gameSettings { 
        id safeMode modelType proofRead temperature textLength directDialog __typename 
      } 
      __typename 
    }
  }
`

function Settings({locale}) {
  const [temperature, setTemperature] = useState('0.2')
  const [useThree, setUseThree] = useState(true)

  const [changeSettings, {loading}] = useMutation(SETTINGS)

  const handleClick = () => {
    const input = {
        modelType: useThree ? 'dragon' : 'griffin',
        directDialog: true,
        safeMode: false,
        temperature: parseFloat(temperature)
    }
    changeSettings({
      variables:{input}
    })
  }

  const help_ko = `GPT-3 사용?/설정 적용!`
 
  const [help,setHelp] = useState(help_ko)
  useEffect( () => {
    async function go() {
      setHelp(await translate_to_local(help_ko,locale))
    }
    
    go();
  },[help_ko,locale])

  const [useGpt3Msg,applyMsg] = help.split('/')

  return (<>
  <table>
    <tbody>
  <tr className="settings">
    <td>
      {useGpt3Msg} <input type="checkbox" defaultChecked={useThree} onChange={e=>setUseThree(e.checked)} />
    </td>
    <td>
      Temperature <input value={temperature} onChange={e => setTemperature(e.target.value)}/>
    </td>
    <td>
    <button className="btn" onClick={handleClick} disabled={loading}>
      {applyMsg}
    </button>
    </td>
  </tr>
  </tbody>
  </table>
  </>)
}

async function preserve_whitespaces(x, fn) {
  const head = x.match(/^[ \t\n]+/)
  const tail = x.match(/[ \t\n]+$/)

  x = await fn(x)

  if (head) {
    x = head[0] + x
  }
  if (tail) {
    x = x + tail
  }

  return x
}

async function translate_to_local(local_text,locale) {
  return await preserve_whitespaces(local_text,async () => {
    const {data} = await axios.post(URL_TRANSLATOR,[local_text,locale])
    return data
  })
}

async function translate_from_local(local_text,locale) {
  return await preserve_whitespaces(local_text,async () => {
    const {data} = await axios.post(URL_TRANSLATOR,[local_text,"en"])
    return data
  })
}

function Fragment({adventureId, fragId, text, editing, setEditing, locale}) {
  const [hovered, setHover] = useState(false);
  const [alter] = useMutation(ALTER,{
    refetchQueries: [{ query: READ_CONTENT, variables: {id:adventureId}}] 
  });
  const [translated, setTranslated] = useState('');
  useEffect(() => {
    async function main() {
      setTranslated(await translate_to_local(text,locale));
    }
    main();    
  },[text,locale])

  const handleClick = (msg) => {
    const input = {
      type: 'alter',
      text: msg,
      id: adventureId,
      actionId: fragId,
    }
    return alter({
      variables:{input}
    })
  }

  const me = {text, handleClick, fragId}

  return (
    <>
    <span
      className={fragId === editing?.fragId ? 'editing' : hovered ? 'hovered':''}
      onMouseOver={(e) => {setHover(true)}}
      onMouseOut={(e) => {setHover(false)}}
      onClick={(e) => setEditing(me)}
      >{translated.split('\n').map((t,i) => (<span key={i}>{i ? (<><br/>{t}</>) : (<>{t}</>)}</span>))}</span>
    </>    
  )
}

function Content({adventureId,editing,setEditing,locale}) {
  const { loading, error, data } = useQuery(READ_CONTENT, {id:adventureId});

  if (adventureId) {
    if (loading) return <p>Loading...</p>
    if (error) return <p>Error</p>
  } else {
    return <p/>
  }

  const actions = data?.content?.actions;
  if (!actions) return <p>Empty</p>

  return (
    <>
    <ul>
      {actions.map(({id,text}) => (
        <Fragment 
          key={id} 
          adventureId={adventureId} 
          fragId={id} 
          text={text} 
          editing={editing} 
          locale={locale}
          setEditing={setEditing}/>
      ))}
    </ul>    
    </>
  )
}



function SendAction({adventureId,editing,setEditing,locale}) {    
  const [sendAction, {error}] = useMutation(SEND_ACTION);
  const [busy, setBusy] = useState(false);

  const handleClick_sendAction = (action) => {    
    const input = {
      type: 'story',
      text: action,
      id: adventureId
    }
    const out = sendAction({
      variables: {input},
      refetchQueries: [{ query: READ_CONTENT, variables: {id:adventureId}}] 
    })
    setAction('');
    return out
  }

  const {handleClick,text} = editing || {text:'', handleClick:handleClick_sendAction}
  const [action, setAction] = useState(text);
  
  function clear() {
    setEditing(null);
    setAction('')
  }

  useEffect(() => {
    async function go() {
      setAction(await translate_to_local(text,locale));
    }
    go();
  }, [text,locale])

  async function submit() {
    const translated = await translate_from_local(action,locale);
    setBusy(true);
    handleClick(translated).then(() => setBusy(false))
    clear();
  }

  const help_ko = '수정!/추가!/생성!'
 
  const [help,setHelp] = useState('//')
  useEffect( () => {
    async function go() {
      setHelp(await translate_to_local(help_ko,locale))
    }
    
    go();
  },[locale])

  const [alterMsg, goMsg, createMsg] = help.split('/')  

  return (
    <>
    <textarea
        className="Prompt"
        placeholder="Text"
        disabled={busy}
        onChange={e => setAction(e.target.value)}
        onKeyDown={e => {
          if (e.keyCode === 13 && !e.shiftKey) {
            submit();
            e.preventDefault();
          } else if (e.keyCode === 27) {
            clear()
          }
        }}
        value={action}
    />
    <button className="btn" onClick={submit} disabled={busy}>
      {adventureId ? editing ? alterMsg : goMsg : createMsg}
    </button>
    {error && <p style={{color:"red"}}>Error :(</p>}
    </>
  )  
}

function Test() {
  const prompt = `사용자: 클로바, 오늘 날씨 어때?
클로바: 오늘 날씨는 맑아요.

사용자: 클로바, 오늘 비 많이 와?
클로바: 글쎄, 조금 올 것 같은데요.`;
  const id = 'scenario:458625';
  const handleClick = (prompt) => {
    return createAdventure({
      variables: {id, prompt}
    }).catch(e => {
      console.log(error)
    })
  }

  const defaultEditing = {handleClick:handleClick,text:prompt}

  
  const [editing, setEditing] = useState(defaultEditing);
  const [adventureId, setAdventureId] = useState('');
  const [alter] = useMutation(ALTER,{
    refetchQueries: [{ query: READ_CONTENT, variables: {id:adventureId}}] 
  });
  const [createAdventure, { error }] = useMutation(CREATE_ADVENTURE, {
    update(cache, {data:{createAdventureFromScenarioId}}) {
      const {id,historyList,__typename} = createAdventureFromScenarioId;
      setAdventureId(id);

      if (historyList.length === 2) {
        const input = {
          type: 'alter',
          text: '',
          id: id,
          actionId: historyList[1].id,
        }
        alter({
          variables:{input}
        })
      }

      cache.writeQuery({
        query: READ_CONTENT,
        data: { content: { 
          id, 
          actions: historyList.map(({id,text}) => ({id,text,__typename:'Piece'})), __typename } }
      })
    }
  });

  const [locale,setLocale] = useState('ko')

  const help_ko = 
`텍스트를 클릭하여 텍스트를 비운 후에, '수정!'을 누릅니다. 그 이후에 빈 텍스트를 넣고 '추가!'를 누르면, 계속 생성됩니다.
GPT-3는 영어 90% 이상으로 학습된 모델로, 한글은 구글 번역기의 힘을 빌어 처리됩니다. 따라서, 매끄럽지 않은 번역 양해 부탁드립니다. :)
Temperature는 생성할 때 얼마나 자유롭게 선택하도록 할 것인가의 정도입니다. 0에 근접할수록, top-1의 대답을 고집하고 1에 가까워지면  좀 더 자유롭게 생성을 하게 됩니다.`
 
  const [help,setHelp] = useState('')
  useEffect( () => {
    async function go() {
      setHelp(await translate_to_local(help_ko,locale))
    }
    
    go();
  },[help_ko,locale])
  
  return (
    <>
    <h3>CLOVA GPT-3 Playground</h3>    
    <span className="locale">
    {['en','ko','ja','ru'].map(loc => (<span key={loc}><input type="radio" checked={locale === loc} onChange={() => 1} onClick={() => setLocale(loc)} value={loc}/>{loc}</span>))}
    </span>
    <Settings locale={locale}/>
    
    <Content adventureId={adventureId} editing={editing} setEditing={setEditing} locale={locale}/>
    {error && <p style={{color:"red"}}>Error :(</p>}
    <SendAction adventureId={adventureId} editing={editing} setEditing={setEditing} locale={locale}/>

    {help.split('\n').map((h,i) => <p className="help" key={i}>{h}</p>)}    
    </>
  )
}

function App() {
  const GRAPHQL_ENDPOINT = 'wss://api.aidungeon.io/subscriptions';
  
  const AUTH_TOKEN = process.env.REACT_APP_AUTH_TOKEN || '';
  
  const [authToken, setAuthToken] = useState(window.localStorage.getItem('authToken') || AUTH_TOKEN);
  const [client, setClient] = useState(null);

  useEffect(() => {
    const link = new WebSocketLink({
      uri: GRAPHQL_ENDPOINT,
      options: { reconnect: true, connectionParams: {token: authToken} },
    });
  
    const apolloClient = new ApolloClient({
      link,
      cache: new InMemoryCache(),
    });
    
    setClient(apolloClient);
    window.localStorage.setItem('authToken',authToken)
  },[authToken]);  

  if (!client) {
    return <></>;
  }

  return (
    <>
    <input className="authToken" value={authToken} onChange={e => setAuthToken(e.target.value)}/>
    <ApolloProvider client={client} className="App">      
      <header className="App-header">
        <Test/>
      </header>
    </ApolloProvider>
    </>
  );
}

export default App;
