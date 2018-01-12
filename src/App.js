import React from 'react';
import Route from 'react-router-dom/Route';
import Switch from 'react-router-dom/Switch';
import Home from './home/Home';
import Books from './books/Books';
import Profile from './profile/Profile';
import Nav from './nav/Nav'
import './App.css';

// Used in both client and server rendering
// Client will not utilize data as it exists only on the server
// Instead, the client will initilialize it's state from a JSON.stringify(object)
// generated by the server render
const App = (data) =>{
  return <div>
    <Nav />
    <Switch>
      <Route exact path="/" render={() => <Home {...data} />} />
      <Route exact path="/profile" render={() => <Profile {...data} />} />
      <Route exact path="/books" render={() => <Books {...data} />} />
    </Switch>
  </div>
};


export default App;